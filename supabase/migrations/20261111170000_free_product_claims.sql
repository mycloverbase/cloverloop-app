alter table public.storefront_products
  add constraint storefront_products_claim_reference_key
  unique (id, storefront_id, user_id);

create table public.product_claims (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  storefront_id uuid not null,
  creator_id uuid not null references auth.users (id) on delete cascade,
  customer_email text not null check (
    customer_email = lower(btrim(customer_email))
    and char_length(customer_email) between 3 and 254
  ),
  claim_token_hash text not null unique check (claim_token_hash ~ '^[0-9a-f]{64}$'),
  token_expires_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'email_sent', 'downloaded', 'expired', 'failed')),
  email_sent_at timestamptz,
  terms_accepted_at timestamptz not null,
  download_count integer not null default 0 check (download_count >= 0),
  max_downloads integer not null default 3 check (max_downloads between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (product_id, storefront_id, creator_id)
    references public.storefront_products (id, storefront_id, user_id)
    on delete cascade,
  unique (product_id, customer_email),
  check (
    (status in ('email_sent', 'downloaded', 'expired') and email_sent_at is not null)
    or (status in ('pending', 'failed') and email_sent_at is null)
  )
);

create index product_claims_storefront_created_idx
  on public.product_claims (storefront_id, created_at desc);
create index product_claims_product_created_idx
  on public.product_claims (product_id, created_at desc);
create index product_claims_creator_created_idx
  on public.product_claims (creator_id, created_at desc);

create trigger set_product_claims_updated_at
  before update on public.product_claims
  for each row execute function public.set_creator_storefront_updated_at();

alter table public.product_claims enable row level security;
revoke all on public.product_claims from public, anon, authenticated;
grant select on public.product_claims to authenticated;

create policy "Creators can read claims for their own products"
  on public.product_claims for select to authenticated
  using (
    exists (
      select 1
      from public.storefront_products product
      where product.id = product_claims.product_id
        and product.storefront_id = product_claims.storefront_id
        and product_claims.creator_id = (select auth.uid())
        and product.user_id = (select auth.uid())
    )
  );

create table public.free_product_rate_limits (
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (key_hash, window_started_at)
);

alter table public.free_product_rate_limits enable row level security;
revoke all on public.free_product_rate_limits from public, anon, authenticated;

create or replace function public.check_free_product_rate_limit(
  requested_keys text[],
  requested_limits integer[],
  requested_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  key_index integer;
  bucket_start timestamptz;
  attempts integer;
begin
  if cardinality(requested_keys) = 0
    or cardinality(requested_keys) <> cardinality(requested_limits)
    or cardinality(requested_keys) > 4
    or requested_window_seconds not between 60 and 86400
    or exists (
      select 1 from unnest(requested_keys) as key_value
      where key_value !~ '^[0-9a-f]{64}$'
    )
    or exists (
      select 1 from unnest(requested_limits) as limit_value
      where limit_value not between 1 and 1000
    ) then
    raise exception 'Invalid rate limit request';
  end if;

  bucket_start := to_timestamp(
    floor(extract(epoch from now()) / requested_window_seconds) * requested_window_seconds
  );

  delete from public.free_product_rate_limits
  where window_started_at < now() - interval '48 hours';

  for key_index in 1..cardinality(requested_keys) loop
    perform pg_advisory_xact_lock(hashtext(requested_keys[key_index]));
    insert into public.free_product_rate_limits (key_hash, window_started_at, request_count)
    values (requested_keys[key_index], bucket_start, 1)
    on conflict (key_hash, window_started_at) do update
      set request_count = public.free_product_rate_limits.request_count + 1
    returning request_count into attempts;

    if attempts > requested_limits[key_index] then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.claim_free_product(
  requested_product_id uuid,
  requested_storefront_username text,
  requested_customer_email text,
  requested_claim_token_hash text,
  requested_token_expires_at timestamptz,
  requested_terms_accepted_at timestamptz,
  requested_max_downloads integer
)
returns table (
  claim_id uuid,
  product_name text,
  creator_name text,
  product_file_name text,
  disposition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_row record;
  existing_claim public.product_claims%rowtype;
  new_claim_id uuid;
begin
  if requested_customer_email is null
    or requested_customer_email <> lower(btrim(requested_customer_email))
    or char_length(requested_customer_email) not between 3 and 254
    or requested_customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or requested_claim_token_hash is null
    or requested_claim_token_hash !~ '^[0-9a-f]{64}$'
    or requested_token_expires_at is null
    or requested_token_expires_at <= now()
    or requested_token_expires_at > now() + interval '7 days'
    or requested_terms_accepted_at is null
    or requested_terms_accepted_at > now() + interval '1 minute'
    or requested_max_downloads is null
    or requested_max_downloads not between 1 and 20 then
    raise exception 'Invalid free product claim';
  end if;

  select
    product.id,
    product.storefront_id,
    product.user_id,
    product.name,
    product.file_path,
    product.file_name,
    storefront.store_name,
    coalesce(nullif(btrim(profile.display_name), ''), storefront.store_name) as creator_name
  into product_row
  from public.storefront_products product
  join public.creator_storefronts storefront
    on storefront.id = product.storefront_id
   and storefront.user_id = product.user_id
  left join public.creator_profiles profile on profile.user_id = product.user_id
  where product.id = requested_product_id
    and storefront.username = lower(btrim(requested_storefront_username))
    and storefront.status = 'published'
    and storefront.deleted_at is null
    and product.is_free
    and product.price_paise = 0
    and product.is_active
    and product.deleted_at is null
    and product.file_path is not null
    and product.file_name is not null
    and exists (
      select 1 from storage.objects stored_file
      where stored_file.bucket_id = 'product-files'
        and stored_file.name = product.file_path
    )
  for update of product, storefront;

  if not found then
    raise exception 'Free product is not available';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(requested_product_id::text),
    hashtext(requested_customer_email)
  );

  select * into existing_claim
  from public.product_claims claim
  where claim.product_id = requested_product_id
    and claim.customer_email = requested_customer_email
  for update;

  if found then
    if existing_claim.status in ('email_sent', 'downloaded')
      and existing_claim.token_expires_at > now()
      and existing_claim.download_count < existing_claim.max_downloads then
      return query select
        existing_claim.id,
        product_row.name,
        product_row.creator_name,
        product_row.file_name,
        'already_sent'::text;
      return;
    end if;
    if existing_claim.status = 'pending'
      and existing_claim.updated_at > now() - interval '2 minutes' then
      return query select
        existing_claim.id,
        product_row.name,
        product_row.creator_name,
        product_row.file_name,
        'processing'::text;
      return;
    end if;
    if existing_claim.download_count >= existing_claim.max_downloads then
      raise exception 'Download limit reached';
    end if;

    update public.product_claims claim
    set claim_token_hash = requested_claim_token_hash,
        token_expires_at = requested_token_expires_at,
        status = 'pending',
        email_sent_at = null,
        terms_accepted_at = requested_terms_accepted_at,
        max_downloads = requested_max_downloads,
        updated_at = now()
    where claim.id = existing_claim.id
    returning claim.id into new_claim_id;
  else
    insert into public.product_claims (
      product_id,
      storefront_id,
      creator_id,
      customer_email,
      claim_token_hash,
      token_expires_at,
      terms_accepted_at,
      max_downloads
    )
    values (
      product_row.id,
      product_row.storefront_id,
      product_row.user_id,
      requested_customer_email,
      requested_claim_token_hash,
      requested_token_expires_at,
      requested_terms_accepted_at,
      requested_max_downloads
    )
    returning id into new_claim_id;
  end if;

  return query select
    new_claim_id,
    product_row.name,
    product_row.creator_name,
    product_row.file_name,
    'send_email'::text;
end;
$$;

create or replace function public.mark_free_product_claim_email_sent(
  requested_claim_id uuid,
  requested_claim_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.product_claims claim
  set status = 'email_sent',
      email_sent_at = now(),
      updated_at = now()
  where claim.id = requested_claim_id
    and claim.claim_token_hash = requested_claim_token_hash
    and claim.status = 'pending'
    and claim.token_expires_at > now();
  return found;
end;
$$;

create or replace function public.mark_free_product_claim_email_failed(
  requested_claim_id uuid,
  requested_claim_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.product_claims claim
  set status = 'failed',
      updated_at = now()
  where claim.id = requested_claim_id
    and claim.claim_token_hash = requested_claim_token_hash
    and claim.status = 'pending';
  return found;
end;
$$;

create or replace function public.record_free_product_download(
  requested_claim_token_hash text,
  requested_file_path text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim_row public.product_claims%rowtype;
begin
  select * into claim_row
  from public.product_claims claim
  where claim.claim_token_hash = requested_claim_token_hash
  for update;

  if not found then
    return false;
  end if;
  if claim_row.token_expires_at <= now() then
    update public.product_claims
    set status = 'expired',
        updated_at = now()
    where id = claim_row.id
      and status in ('email_sent', 'downloaded');
    return false;
  end if;
  if claim_row.status not in ('email_sent', 'downloaded')
    or claim_row.download_count >= claim_row.max_downloads then
    return false;
  end if;

  perform 1
  from public.storefront_products product
  join public.creator_storefronts storefront
    on storefront.id = product.storefront_id
   and storefront.user_id = product.user_id
  where product.id = claim_row.product_id
    and product.storefront_id = claim_row.storefront_id
    and product.user_id = claim_row.creator_id
    and product.is_free
    and product.price_paise = 0
    and product.is_active
    and product.deleted_at is null
    and product.file_path = requested_file_path
    and storefront.status = 'published'
    and storefront.deleted_at is null
  for share of product, storefront;
  if not found then
    return false;
  end if;

  update public.product_claims
  set status = 'downloaded',
      download_count = download_count + 1,
      updated_at = now()
  where id = claim_row.id
    and download_count < max_downloads;
  return found;
end;
$$;

create or replace function public.get_my_free_product_claim_stats()
returns table (
  product_id uuid,
  product_name text,
  claim_count bigint,
  successful_download_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    product.id,
    product.name,
    count(claim.id),
    coalesce(sum(claim.download_count), 0)
  from public.storefront_products product
  left join public.product_claims claim
    on claim.product_id = product.id
   and claim.creator_id = (select auth.uid())
  where product.user_id = (select auth.uid())
    and product.is_free
    and product.deleted_at is null
  group by product.id, product.name
  order by product.name;
$$;

revoke all on function public.check_free_product_rate_limit(text[], integer[], integer) from public, anon, authenticated;
revoke all on function public.claim_free_product(uuid, text, text, text, timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.mark_free_product_claim_email_sent(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_free_product_claim_email_failed(uuid, text) from public, anon, authenticated;
revoke all on function public.record_free_product_download(text, text) from public, anon, authenticated;
revoke all on function public.get_my_free_product_claim_stats() from public, anon;

grant execute on function public.check_free_product_rate_limit(text[], integer[], integer) to service_role;
grant execute on function public.claim_free_product(uuid, text, text, text, timestamptz, timestamptz, integer) to service_role;
grant execute on function public.mark_free_product_claim_email_sent(uuid, text) to service_role;
grant execute on function public.mark_free_product_claim_email_failed(uuid, text) to service_role;
grant execute on function public.record_free_product_download(text, text) to service_role;
grant execute on function public.get_my_free_product_claim_stats() to authenticated;
