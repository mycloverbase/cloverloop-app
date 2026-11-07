create table public.storefront_products (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references public.creator_storefronts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  product_type text not null default 'digital' check (product_type = 'digital'),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text not null check (char_length(btrim(description)) between 1 and 5000),
  category text check (category is null or char_length(btrim(category)) <= 50),
  is_free boolean not null default false,
  price_paise bigint not null default 0
    check (price_paise between 0 and 9007199254740991)
    check ((is_free and price_paise = 0) or (not is_free and price_paise > 0)),
  is_active boolean not null default false,
  cover_image_path text references public.storefront_assets (path) on delete set null,
  file_path text,
  retired_file_path text,
  file_name text,
  file_size bigint,
  file_mime_type text,
  pending_file_path text,
  pending_file_name text,
  pending_file_expires_at timestamptz,
  first_listed_at timestamptz,
  counted_as_free boolean not null default false,
  counted_as_paid boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (file_path is null and file_name is null and file_size is null and file_mime_type is null)
    or (file_path is not null and file_name is not null and file_size is not null and file_mime_type is not null)
  ),
  check (file_size is null or file_size between 1 and 104857600),
  check (
    (pending_file_path is null and pending_file_name is null and pending_file_expires_at is null)
    or (pending_file_path is not null and pending_file_name is not null and pending_file_expires_at is not null)
  ),
  check (
    file_path is null
    or file_path ~ (
      '^' || user_id::text || '/' || id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|mp3|doc|docx|ppt|pptx|xls|xlsx|epub|zip|txt|rtf|mp4|wav|jpg|jpeg|png|webp)$'
    )
  ),
  check (
    retired_file_path is null
    or retired_file_path ~ (
      '^' || user_id::text || '/' || id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|mp3|doc|docx|ppt|pptx|xls|xlsx|epub|zip|txt|rtf|mp4|wav|jpg|jpeg|png|webp)$'
    )
  ),
  check (
    pending_file_path is null
    or pending_file_path ~ (
      '^' || user_id::text || '/' || id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|mp3|doc|docx|ppt|pptx|xls|xlsx|epub|zip|txt|rtf|mp4|wav|jpg|jpeg|png|webp)$'
    )
  ),
  check (not is_active or (file_path is not null and deleted_at is null)),
  check (deleted_at is null or not is_active),
  check (first_listed_at is not null or (not counted_as_free and not counted_as_paid))
);

create index storefront_products_owner_idx
  on public.storefront_products (user_id, created_at desc)
  where deleted_at is null;
create index storefront_products_public_idx
  on public.storefront_products (storefront_id, created_at desc)
  where is_active and deleted_at is null;
create index storefront_products_free_usage_idx
  on public.storefront_products (user_id)
  where counted_as_free;
create index storefront_products_paid_usage_idx
  on public.storefront_products (user_id)
  where counted_as_paid;

create trigger set_storefront_products_updated_at
  before update on public.storefront_products
  for each row execute function public.set_creator_storefront_updated_at();

alter table public.storefront_products enable row level security;
revoke all on public.storefront_products from public, anon, authenticated;
grant select on public.storefront_products to authenticated;
create policy "Creators can read their own storefront products"
  on public.storefront_products for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.storefront_asset_is_referenced(requested_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.storefront_assets asset
    join public.creator_storefronts storefront on storefront.id = asset.storefront_id
    where asset.path = requested_path
      and (
        storefront.profile_image_path = requested_path
        or storefront.banner_image_path = requested_path
        or exists (
          select 1
          from jsonb_array_elements(coalesce(storefront.customization -> 'products', '[]'::jsonb)) as card(value)
          where card.value ->> 'coverImagePath' = requested_path
        )
        or storefront.published_snapshot ->> 'profile_image_path' = requested_path
        or storefront.published_snapshot ->> 'banner_image_path' = requested_path
        or exists (
          select 1
          from jsonb_array_elements(
            coalesce(storefront.published_snapshot -> 'customization' -> 'products', '[]'::jsonb)
          ) as card(value)
          where card.value ->> 'coverImagePath' = requested_path
        )
        or exists (
          select 1
          from public.storefront_products product
          where product.cover_image_path = requested_path
            and product.deleted_at is null
        )
      )
  );
$$;

create or replace function public.keep_product_cover_assets_referenced()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_referenced = false and public.storefront_asset_is_referenced(old.path) then
    new.is_referenced := true;
  end if;
  return new;
end;
$$;

create trigger keep_product_cover_assets_referenced
  before update of is_referenced on public.storefront_assets
  for each row execute function public.keep_product_cover_assets_referenced();

create or replace function public.sync_storefront_product_cover_assets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.cover_image_path is not null
    and old.cover_image_path is distinct from new.cover_image_path then
    update public.storefront_assets
    set is_referenced = public.storefront_asset_is_referenced(old.cover_image_path)
    where path = old.cover_image_path;
  end if;

  if new.cover_image_path is not null then
    update public.storefront_assets
    set is_referenced = public.storefront_asset_is_referenced(new.cover_image_path)
    where path = new.cover_image_path;
  end if;
  return new;
end;
$$;

create trigger sync_storefront_product_cover_assets
  after insert or update of cover_image_path, deleted_at on public.storefront_products
  for each row execute function public.sync_storefront_product_cover_assets();

create or replace function public.create_storefront_product_draft(
  requested_storefront_id uuid,
  requested_name text,
  requested_description text,
  requested_category text,
  requested_is_free boolean,
  requested_price_paise bigint,
  requested_cover_image_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_product_id uuid := gen_random_uuid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if requested_name is null or char_length(btrim(requested_name)) not between 1 and 100
    or requested_description is null or char_length(btrim(requested_description)) not between 1 and 5000
    or requested_category is not null and char_length(btrim(requested_category)) > 50
    or requested_is_free is null
    or requested_price_paise is null or requested_price_paise < 0
    or requested_price_paise > 9007199254740991
    or (requested_is_free and requested_price_paise <> 0)
    or (not requested_is_free and requested_price_paise = 0) then
    raise exception 'Invalid product details';
  end if;
  if not exists (
    select 1 from public.creator_storefronts storefront
    where storefront.id = requested_storefront_id
      and storefront.user_id = current_user_id
      and storefront.status <> 'deletion_pending'
  ) then
    raise exception 'Storefront not found';
  end if;
  if requested_cover_image_path is not null and not exists (
    select 1 from public.storefront_assets asset
    where asset.path = requested_cover_image_path
      and asset.user_id = current_user_id
      and asset.storefront_id = requested_storefront_id
  ) then
    raise exception 'Invalid product cover image';
  end if;

  insert into public.storefront_products (
    id, storefront_id, user_id, name, description, category, is_free, price_paise, cover_image_path
  ) values (
    created_product_id, requested_storefront_id, current_user_id, btrim(requested_name),
    btrim(requested_description), nullif(btrim(coalesce(requested_category, '')), ''),
    requested_is_free, requested_price_paise, requested_cover_image_path
  );
  return created_product_id;
end;
$$;

create or replace function public.begin_storefront_product_upload(
  requested_product_id uuid,
  requested_extension text,
  requested_file_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  upload_path text;
  safe_extension text := lower(requested_extension);
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if safe_extension is null
    or safe_extension not in ('pdf', 'mp3', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'epub', 'zip', 'txt', 'rtf', 'mp4', 'wav', 'jpg', 'jpeg', 'png', 'webp')
    or requested_file_name is null
    or char_length(btrim(requested_file_name)) not between 1 and 255
    or requested_file_name ~ '[[:cntrl:]]'
    or position('/' in requested_file_name) > 0
    or position(chr(92) in requested_file_name) > 0
    or lower(regexp_replace(requested_file_name, '^.*\.', '')) <> safe_extension then
    raise exception 'Unsupported product file';
  end if;

  upload_path := current_user_id::text || '/' || requested_product_id::text || '/'
    || gen_random_uuid()::text || '.' || safe_extension;
  update public.storefront_products product
  set pending_file_path = upload_path,
      pending_file_name = btrim(requested_file_name),
      pending_file_expires_at = now() + interval '15 minutes'
  where product.id = requested_product_id
    and product.user_id = current_user_id
    and product.deleted_at is null
    and exists (
      select 1 from public.creator_storefronts storefront
      where storefront.id = product.storefront_id
        and storefront.status <> 'deletion_pending'
    )
    and not exists (
      select 1 from storage.objects stored_object
      where stored_object.bucket_id = 'product-files'
        and stored_object.name = product.pending_file_path
    );
  if not found then
    raise exception 'Product not found';
  end if;
  return upload_path;
end;
$$;

create or replace function public.save_storefront_product(
  requested_product_id uuid,
  requested_name text,
  requested_description text,
  requested_category text,
  requested_is_free boolean,
  requested_price_paise bigint,
  requested_cover_image_path text,
  requested_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  product public.storefront_products%rowtype;
  uploaded_path text;
  uploaded_name text;
  uploaded_size bigint;
  uploaded_mime text;
  expected_mime text;
  stored_metadata jsonb;
  account_plan text;
  free_usage bigint;
  paid_usage bigint;
  count_as_free boolean;
  count_as_paid boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  select * into product
  from public.storefront_products
  where id = requested_product_id
    and user_id = current_user_id
    and deleted_at is null
  for update;
  if not found then
    raise exception 'Product not found';
  end if;
  if requested_name is null or char_length(btrim(requested_name)) not between 1 and 100
    or requested_description is null or char_length(btrim(requested_description)) not between 1 and 5000
    or requested_category is not null and char_length(btrim(requested_category)) > 50
    or requested_is_free is null
    or requested_is_active is null
    or requested_price_paise is null or requested_price_paise < 0
    or requested_price_paise > 9007199254740991
    or (requested_is_free and requested_price_paise <> 0)
    or (not requested_is_free and requested_price_paise = 0) then
    raise exception 'Invalid product details';
  end if;
  if not exists (
    select 1 from public.creator_storefronts storefront
    where storefront.id = product.storefront_id
      and storefront.user_id = current_user_id
      and storefront.status <> 'deletion_pending'
  ) then
    raise exception 'Storefront not found';
  end if;
  if requested_cover_image_path is not null and not exists (
    select 1 from public.storefront_assets asset
    where asset.path = requested_cover_image_path
      and asset.user_id = current_user_id
      and asset.storefront_id = product.storefront_id
  ) then
    raise exception 'Invalid product cover image';
  end if;

  uploaded_path := product.file_path;
  uploaded_name := product.file_name;
  uploaded_size := product.file_size;
  uploaded_mime := product.file_mime_type;

  if product.pending_file_path is not null
    and product.pending_file_expires_at > now() then
    select metadata into stored_metadata
    from storage.objects
    where bucket_id = 'product-files'
      and name = product.pending_file_path;
    if found then
      uploaded_path := product.pending_file_path;
      uploaded_name := product.pending_file_name;
      uploaded_size := coalesce(
        nullif(stored_metadata ->> 'size', '')::bigint,
        nullif(stored_metadata ->> 'contentLength', '')::bigint
      );
      uploaded_mime := stored_metadata ->> 'mimetype';
      expected_mime := case lower(regexp_replace(uploaded_name, '^.*\.', ''))
        when 'pdf' then 'application/pdf'
        when 'mp3' then 'audio/mpeg'
        when 'doc' then 'application/msword'
        when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        when 'ppt' then 'application/vnd.ms-powerpoint'
        when 'pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        when 'xls' then 'application/vnd.ms-excel'
        when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        when 'epub' then 'application/epub+zip'
        when 'zip' then 'application/zip'
        when 'txt' then 'text/plain'
        when 'rtf' then 'application/rtf'
        when 'mp4' then 'video/mp4'
        when 'wav' then 'audio/wav'
        when 'jpg' then 'image/jpeg'
        when 'jpeg' then 'image/jpeg'
        when 'png' then 'image/png'
        when 'webp' then 'image/webp'
        else null
      end;
      if uploaded_size is null or uploaded_size < 1 or uploaded_size > 104857600
        or uploaded_mime is distinct from expected_mime then
        raise exception 'Invalid product file';
      end if;
    end if;
  end if;

  if uploaded_path is null then
    raise exception 'A product file is required';
  end if;
  if requested_is_active and uploaded_path is null then
    raise exception 'A product file is required before activation';
  end if;
  if uploaded_path is distinct from product.file_path and product.retired_file_path is not null then
    raise exception 'Previous product file cleanup is pending';
  end if;

  count_as_free := product.counted_as_free;
  count_as_paid := product.counted_as_paid;
  if (requested_is_free and not count_as_free) or (not requested_is_free and not count_as_paid) then
    perform pg_advisory_xact_lock(hashtext(current_user_id::text), hashtext('storefront-product-limits'));
    select raw_app_meta_data ->> 'plan' into account_plan
    from auth.users
    where id = current_user_id;

    if coalesce(account_plan, 'free') not in ('creator', 'pro_creator') then
      if requested_is_free and not count_as_free then
        select count(*) into free_usage
        from public.storefront_products
        where user_id = current_user_id and counted_as_free;
        if free_usage >= 5 then
          raise exception 'Free product listing limit reached';
        end if;
      elsif not requested_is_free and not count_as_paid then
        select count(*) into paid_usage
        from public.storefront_products
        where user_id = current_user_id and counted_as_paid;
        if paid_usage >= 1 then
          raise exception 'Paid product listing limit reached';
        end if;
      end if;
    end if;
    count_as_free := count_as_free or requested_is_free;
    count_as_paid := count_as_paid or not requested_is_free;
  end if;

  update public.storefront_products
  set name = btrim(requested_name),
      description = btrim(requested_description),
      category = nullif(btrim(coalesce(requested_category, '')), ''),
      is_free = requested_is_free,
      price_paise = requested_price_paise,
      cover_image_path = requested_cover_image_path,
      is_active = requested_is_active,
      retired_file_path = case
        when uploaded_path is distinct from product.file_path then product.file_path
        else product.retired_file_path
      end,
      file_path = uploaded_path,
      file_name = uploaded_name,
      file_size = uploaded_size,
      file_mime_type = uploaded_mime,
      pending_file_path = null,
      pending_file_name = null,
      pending_file_expires_at = null,
      first_listed_at = coalesce(first_listed_at, now()),
      counted_as_free = count_as_free,
      counted_as_paid = count_as_paid
  where id = requested_product_id;
end;
$$;

create or replace function public.delete_storefront_product(requested_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  update public.storefront_products product
  set is_active = false,
      deleted_at = now()
  where product.id = requested_product_id
    and product.user_id = auth.uid()
    and product.deleted_at is null
    and exists (
      select 1 from public.creator_storefronts storefront
      where storefront.id = product.storefront_id
        and storefront.status <> 'deletion_pending'
    );
  if not found then
    raise exception 'Product not found';
  end if;
end;
$$;

revoke all on function public.storefront_asset_is_referenced(text) from public, anon, authenticated;
revoke all on function public.keep_product_cover_assets_referenced() from public, anon, authenticated;
revoke all on function public.sync_storefront_product_cover_assets() from public, anon, authenticated;
revoke all on function public.create_storefront_product_draft(uuid, text, text, text, boolean, bigint, text) from public, anon, authenticated;
revoke all on function public.begin_storefront_product_upload(uuid, text, text) from public, anon, authenticated;
revoke all on function public.save_storefront_product(uuid, text, text, text, boolean, bigint, text, boolean) from public, anon, authenticated;
revoke all on function public.delete_storefront_product(uuid) from public, anon, authenticated;
grant execute on function public.create_storefront_product_draft(uuid, text, text, text, boolean, bigint, text) to authenticated;
grant execute on function public.begin_storefront_product_upload(uuid, text, text) to authenticated;
grant execute on function public.save_storefront_product(uuid, text, text, text, boolean, bigint, text, boolean) to authenticated;
grant execute on function public.delete_storefront_product(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-files',
  'product-files',
  false,
  104857600,
  array[
    'application/pdf',
    'audio/mpeg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/epub+zip',
    'application/zip',
    'text/plain',
    'application/rtf',
    'video/mp4',
    'audio/wav',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Creators can upload files to their product upload slot"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-files'
    and exists (
      select 1 from public.storefront_products product
      where product.id::text = (storage.foldername(name))[2]
        and product.user_id = (select auth.uid())
        and product.deleted_at is null
        and product.pending_file_path = name
        and product.pending_file_expires_at > now()
    )
  );

create policy "Creators can read their own product files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'product-files'
    and exists (
      select 1 from public.storefront_products product
      where product.user_id = (select auth.uid())
        and product.deleted_at is null
        and name in (product.file_path, product.pending_file_path)
    )
  );

create or replace function public.is_published_storefront_asset(requested_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.storefront_assets asset
    join public.creator_storefronts storefront on storefront.id = asset.storefront_id
    where asset.path = requested_path
      and storefront.status = 'published'
      and storefront.deleted_at is null
      and (
        requested_path = storefront.published_snapshot ->> 'profile_image_path'
        or requested_path = storefront.published_snapshot ->> 'banner_image_path'
        or exists (
          select 1
          from jsonb_array_elements(coalesce(
            storefront.published_snapshot -> 'customization' -> 'products',
            '[]'::jsonb
          )) as card(value)
          where card.value ->> 'coverImagePath' = requested_path
        )
        or exists (
          select 1
          from public.storefront_products product
          where product.storefront_id = storefront.id
            and product.cover_image_path = requested_path
            and product.is_active
            and product.deleted_at is null
        )
      )
  );
$$;

create or replace view public.published_storefront_products
with (security_barrier = true)
as
select
  storefront.username,
  product.storefront_id,
  product.id,
  product.name,
  product.description,
  product.category,
  product.product_type,
  product.is_free,
  product.price_paise,
  product.cover_image_path
from public.storefront_products product
join public.creator_storefronts storefront on storefront.id = product.storefront_id
where storefront.status = 'published'
  and storefront.deleted_at is null
  and product.is_active
  and product.deleted_at is null;

revoke all on public.published_storefront_products from public, authenticated;
grant select on public.published_storefront_products to anon, authenticated;
