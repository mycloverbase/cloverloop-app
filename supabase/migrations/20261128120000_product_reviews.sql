-- Verified-buyer product reviews, post-purchase review invitations and moderation.
--
-- Policy summary
--   * Every paid order (one product per order) gets exactly one review invitation
--     (unique order_id), scheduled 5 days after the order's paid_at timestamp.
--   * A buyer (identified by a hash of their lower-cased email) can publish one review
--     per product. Later purchases of an already-reviewed product are skipped.
--   * Orders that are not paid, or whose processed refund covers the full amount, are
--     never invited and cannot submit. Partial refunds keep the purchase eligible because
--     the existing refund lifecycle does not revoke the buyer's product access.
--   * Review tokens are stored only as SHA-256 hashes, expire, and are single-use.

-- The composite product foreign keys below need a unique key on storefront_products
-- (id, storefront_id, user_id). 20261111170000_free_product_claims.sql adds it as
-- storefront_products_claim_reference_key, but some databases are missing it. id is the
-- primary key, so the combination is always unique and adding it cannot fail on existing rows.
do $$
begin
  if not exists (
    select 1
      from pg_index idx
     where idx.indrelid = 'public.storefront_products'::regclass
       and idx.indisunique
       and idx.indpred is null
       and idx.indexprs is null
       and (
         select array_agg(attribute.attname::text order by attribute.attname::text)
           from unnest(idx.indkey::int2[]) as key(attnum)
           join pg_attribute attribute
             on attribute.attrelid = idx.indrelid
            and attribute.attnum = key.attnum
       ) = array['id', 'storefront_id', 'user_id']
  ) then
    alter table public.storefront_products
      add constraint storefront_products_claim_reference_key
      unique (id, storefront_id, user_id);
  end if;
end;
$$;

-- The buyer review page lives at /review, so the storefront username must stay unavailable.
insert into public.storefront_reserved_usernames (username)
values ('review')
on conflict (username) do nothing;

create table public.product_review_invitations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique,
  environment text not null check (environment in ('test', 'live')),
  creator_id uuid not null references auth.users(id) on delete cascade,
  storefront_id uuid not null references public.creator_storefronts(id) on delete restrict,
  product_id uuid not null references public.storefront_products(id) on delete restrict,
  customer_email text not null,
  paid_at timestamptz not null,
  eligible_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'processing', 'accepted', 'delivered', 'failed', 'suppressed', 'skipped')),
  skip_reason text check (
    skip_reason is null
    or skip_reason in ('order_not_paid', 'refunded', 'product_unavailable', 'already_reviewed', 'delivery_failed')
  ),
  delivery_generation integer not null default 0 check (delivery_generation >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_email_id text unique check (provider_email_id is null or char_length(provider_email_id) <= 200),
  token_hash text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  token_expires_at timestamptz,
  token_used_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  next_attempt_at timestamptz not null,
  locked_until timestamptz,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_review_invitations_order_fk
    foreign key (order_id, environment)
    references public.razorpay_checkout_orders (id, environment)
    on delete cascade,
  constraint product_review_invitations_product_owner_fk
    foreign key (product_id, storefront_id, creator_id)
    references public.storefront_products (id, storefront_id, user_id)
    on delete restrict,
  check ((status = 'processing') = (locked_until is not null)),
  check ((status = 'skipped') = (skip_reason is not null)),
  check ((status = 'delivered') = (delivered_at is not null)),
  check (status not in ('accepted', 'delivered', 'suppressed') or provider_email_id is not null),
  check ((token_hash is null) = (token_expires_at is null))
);

create index product_review_invitations_due_idx
  on public.product_review_invitations (environment, next_attempt_at)
  where status in ('scheduled', 'failed', 'processing');
create index product_review_invitations_product_idx
  on public.product_review_invitations (product_id);

create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null unique references public.product_review_invitations(id) on delete cascade,
  order_id uuid not null unique references public.razorpay_checkout_orders(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  storefront_id uuid not null,
  product_id uuid not null,
  buyer_key text not null check (buyer_key ~ '^[0-9a-f]{64}$'),
  reviewer_name text not null check (char_length(btrim(reviewer_name)) between 1 and 60),
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 2000),
  status text not null default 'published' check (status in ('published', 'hidden')),
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 500),
  moderated_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_reviews_product_owner_fk
    foreign key (product_id, storefront_id, creator_id)
    references public.storefront_products (id, storefront_id, user_id)
    on delete cascade,
  constraint product_reviews_one_per_buyer_product unique (product_id, buyer_key)
);

create index product_reviews_published_product_idx
  on public.product_reviews (product_id, submitted_at desc)
  where status = 'published';
create index product_reviews_creator_idx
  on public.product_reviews (creator_id, submitted_at desc);

create table public.product_review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.product_reviews(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'offensive', 'fraudulent', 'not_about_product', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 500),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_id, reporter_id),
  check ((status = 'open') = (resolved_at is null))
);

create index product_review_reports_open_idx
  on public.product_review_reports (created_at)
  where status = 'open';

create table public.resend_review_invitation_events (
  event_id text primary key check (char_length(event_id) between 1 and 200),
  event_type text not null,
  invitation_id uuid references public.product_review_invitations(id) on delete set null,
  provider_email_id text check (provider_email_id is null or char_length(provider_email_id) <= 200),
  created_at timestamptz not null default now()
);

-- Access control. Invitations and webhook events are service-role only. Creators may read
-- reviews and reports for their own products; everything else goes through definer functions.

alter table public.product_review_invitations enable row level security;
alter table public.product_reviews enable row level security;
alter table public.product_review_reports enable row level security;
alter table public.resend_review_invitation_events enable row level security;

revoke all on public.product_review_invitations from public, anon, authenticated;
revoke all on public.product_reviews from public, anon, authenticated;
revoke all on public.product_review_reports from public, anon, authenticated;
revoke all on public.resend_review_invitation_events from public, anon, authenticated;

grant select on public.product_reviews to authenticated;
grant select on public.product_review_reports to authenticated;
grant all on public.product_review_invitations to service_role;
grant all on public.product_reviews to service_role;
grant all on public.product_review_reports to service_role;
grant all on public.resend_review_invitation_events to service_role;

create policy "Creators can read reviews of their products"
  on public.product_reviews
  for select to authenticated
  using (creator_id = (select auth.uid()));

create policy "Creators can read their own review reports"
  on public.product_review_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

-- Public read models: only published reviews on published products, without buyer data.

create view public.published_product_reviews
with (security_barrier = true)
as
select
  review.id,
  review.product_id,
  review.reviewer_name,
  review.rating,
  review.body,
  review.submitted_at,
  true as verified_purchase
from public.product_reviews review
join public.published_storefront_products product on product.id = review.product_id
where review.status = 'published';

create view public.product_review_summaries
with (security_barrier = true)
as
select
  review.product_id,
  count(*)::integer as review_count,
  round(avg(review.rating)::numeric, 2) as average_rating,
  count(*) filter (where review.rating = 5)::integer as rating_5,
  count(*) filter (where review.rating = 4)::integer as rating_4,
  count(*) filter (where review.rating = 3)::integer as rating_3,
  count(*) filter (where review.rating = 2)::integer as rating_2,
  count(*) filter (where review.rating = 1)::integer as rating_1
from public.product_reviews review
join public.published_storefront_products product on product.id = review.product_id
where review.status = 'published'
group by review.product_id;

revoke all on public.published_product_reviews from public;
revoke all on public.product_review_summaries from public;
grant select on public.published_product_reviews to anon, authenticated, service_role;
grant select on public.product_review_summaries to anon, authenticated, service_role;

-- Helpers.

create or replace function public.product_review_buyer_key(p_email text)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select encode(sha256(convert_to(lower(btrim(p_email)), 'UTF8')), 'hex');
$$;

revoke all on function public.product_review_buyer_key(text) from public, anon, authenticated;
grant execute on function public.product_review_buyer_key(text) to service_role;

create or replace function public.product_review_order_fully_refunded(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.razorpay_payment_attempts attempt
      join public.razorpay_checkout_orders o on o.id = attempt.order_id
     where attempt.order_id = p_order_id
       and attempt.refund_status = 'processed'
       and attempt.refund_amount_paise >= o.amount_paise
  );
$$;

revoke all on function public.product_review_order_fully_refunded(uuid) from public, anon, authenticated;
grant execute on function public.product_review_order_fully_refunded(uuid) to service_role;

-- Scheduling: new paid orders and a one-time backfill of historical paid orders.

create or replace function public.enqueue_product_review_invitation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.order_status = 'paid'
     and new.paid_at is not null
     and (tg_op = 'INSERT' or old.order_status is distinct from 'paid' or old.paid_at is null) then
    insert into public.product_review_invitations (
      order_id, environment, creator_id, storefront_id, product_id,
      customer_email, paid_at, eligible_at, next_attempt_at
    )
    values (
      new.id, new.environment, new.creator_id, new.storefront_id, new.product_id,
      new.customer_email, new.paid_at, new.paid_at + interval '5 days', new.paid_at + interval '5 days'
    )
    on conflict (order_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_product_review_invitation() from public, anon, authenticated;

create trigger enqueue_product_review_invitation_after_paid
  after insert or update of order_status, paid_at on public.razorpay_checkout_orders
  for each row execute function public.enqueue_product_review_invitation();

insert into public.product_review_invitations (
  order_id, environment, creator_id, storefront_id, product_id,
  customer_email, paid_at, eligible_at, next_attempt_at
)
select
  o.id, o.environment, o.creator_id, o.storefront_id, o.product_id,
  o.customer_email, o.paid_at, o.paid_at + interval '5 days', o.paid_at + interval '5 days'
from public.razorpay_checkout_orders o
where o.order_status = 'paid'
  and o.paid_at is not null
on conflict (order_id) do nothing;

-- Delivery: claim a batch, attach the token hash, then record the Resend outcome.

create or replace function public.claim_product_review_invitations(
  p_environment text,
  p_batch_size integer default 10
)
returns table (
  invitation_id uuid,
  delivery_generation integer,
  customer_email text,
  customer_name text,
  product_name text,
  creator_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_batch_size, 10), 1), 100);
begin
  if p_environment is null or p_environment not in ('test', 'live') then
    raise exception 'invalid_review_invitation_environment' using errcode = '22023';
  end if;

  -- Permanently skip invitations that can never be sent.
  with due as (
    select i.id,
           case
             when o.order_status <> 'paid' then 'order_not_paid'
             when public.product_review_order_fully_refunded(o.id) then 'refunded'
             when p.deleted_at is not null then 'product_unavailable'
             when exists (
               select 1
                 from public.product_reviews r
                where r.product_id = i.product_id
                  and r.buyer_key = public.product_review_buyer_key(i.customer_email)
             ) then 'already_reviewed'
             when (not p.is_active or s.status <> 'published' or s.deleted_at is not null)
                  and i.eligible_at < now() - interval '30 days' then 'product_unavailable'
           end as reason
      from public.product_review_invitations i
      join public.razorpay_checkout_orders o on o.id = i.order_id
      join public.storefront_products p on p.id = i.product_id
      join public.creator_storefronts s on s.id = i.storefront_id
     where i.environment = p_environment
       and (
         (i.status in ('scheduled', 'failed') and i.next_attempt_at <= now())
         or (i.status = 'processing' and i.locked_until <= now())
       )
  )
  update public.product_review_invitations i
     set status = 'skipped',
         skip_reason = due.reason,
         locked_until = null,
         updated_at = now()
    from due
   where i.id = due.id
     and due.reason is not null;

  -- Defer invitations whose product is temporarily unavailable (unpublished or inactive).
  update public.product_review_invitations i
     set status = case when i.status = 'processing' then 'failed' else i.status end,
         locked_until = null,
         next_attempt_at = now() + interval '1 day',
         updated_at = now()
    from public.storefront_products p, public.creator_storefronts s
   where p.id = i.product_id
     and s.id = i.storefront_id
     and i.environment = p_environment
     and (
       (i.status in ('scheduled', 'failed') and i.next_attempt_at <= now())
       or (i.status = 'processing' and i.locked_until <= now())
     )
     and (not p.is_active or s.status <> 'published' or s.deleted_at is not null);

  return query
  with candidates as (
    select i.id
      from public.product_review_invitations i
      join public.razorpay_checkout_orders o on o.id = i.order_id
      join public.storefront_products p on p.id = i.product_id
      join public.creator_storefronts s on s.id = i.storefront_id
     where i.environment = p_environment
       and (
         (i.status in ('scheduled', 'failed') and i.next_attempt_at <= now())
         or (i.status = 'processing' and i.locked_until <= now())
       )
       and o.order_status = 'paid'
       and not public.product_review_order_fully_refunded(o.id)
       and p.is_active
       and p.deleted_at is null
       and s.status = 'published'
       and s.deleted_at is null
     order by i.next_attempt_at, i.created_at
     for update of i skip locked
     limit v_limit
  ),
  claimed as (
    update public.product_review_invitations i
       set status = 'processing',
           attempt_count = i.attempt_count + 1,
           locked_until = now() + interval '5 minutes',
           last_error_code = null,
           updated_at = now()
      from candidates c
     where i.id = c.id
     returning i.id, i.delivery_generation, i.order_id, i.product_id, i.storefront_id
  )
  select c.id,
         c.delivery_generation,
         o.customer_email,
         o.customer_name,
         p.name,
         s.store_name
    from claimed c
    join public.razorpay_checkout_orders o on o.id = c.order_id
    join public.storefront_products p on p.id = c.product_id
    join public.creator_storefronts s on s.id = c.storefront_id;
end;
$$;

revoke all on function public.claim_product_review_invitations(text, integer) from public, anon, authenticated;
grant execute on function public.claim_product_review_invitations(text, integer) to service_role;

create or replace function public.attach_product_review_invitation_token(
  p_invitation_id uuid,
  p_delivery_generation integer,
  p_token_hash text,
  p_token_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_token_hash is null
     or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_token_expires_at is null
     or p_token_expires_at <= now() then
    raise exception 'invalid_review_invitation_token' using errcode = '22023';
  end if;

  update public.product_review_invitations i
     set token_hash = p_token_hash,
         token_expires_at = p_token_expires_at,
         updated_at = now()
   where i.id = p_invitation_id
     and i.delivery_generation = p_delivery_generation
     and i.status = 'processing'
     and i.token_used_at is null;
  return found;
end;
$$;

revoke all on function public.attach_product_review_invitation_token(uuid, integer, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.attach_product_review_invitation_token(uuid, integer, text, timestamptz)
  to service_role;

create or replace function public.finish_product_review_invitation_delivery(
  p_invitation_id uuid,
  p_delivery_generation integer,
  p_status text,
  p_provider_email_id text default null,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_type text;
begin
  if p_status not in ('accepted', 'failed')
     or (p_status = 'accepted' and (p_provider_email_id is null or char_length(p_provider_email_id) > 200)) then
    raise exception 'invalid_review_invitation_delivery_state' using errcode = '22023';
  end if;

  if p_status = 'accepted' then
    update public.product_review_invitations i
       set status = 'accepted',
           provider_email_id = p_provider_email_id,
           accepted_at = now(),
           locked_until = null,
           last_error_code = null,
           updated_at = now()
     where i.id = p_invitation_id
       and i.delivery_generation = p_delivery_generation
       and i.status = 'processing';
    if not found then return false; end if;

    update public.resend_review_invitation_events event
       set invitation_id = p_invitation_id
     where event.provider_email_id = p_provider_email_id
       and event.invitation_id is null;

    select event.event_type
      into v_event_type
      from public.resend_review_invitation_events event
     where event.invitation_id = p_invitation_id
       and event.provider_email_id = p_provider_email_id
     order by event.created_at desc
     limit 1;

    if v_event_type = 'email.delivered' then
      update public.product_review_invitations
         set status = 'delivered', delivered_at = now(), updated_at = now()
       where id = p_invitation_id and status = 'accepted';
    elsif v_event_type = 'email.complained' then
      update public.product_review_invitations
         set status = 'suppressed', last_error_code = 'resend_complaint', updated_at = now()
       where id = p_invitation_id and status = 'accepted';
    elsif v_event_type = 'email.bounced' then
      update public.product_review_invitations
         set status = 'skipped', skip_reason = 'delivery_failed', last_error_code = 'resend_bounced', updated_at = now()
       where id = p_invitation_id and status = 'accepted';
    end if;
    return true;
  end if;

  update public.product_review_invitations i
     set status = case when i.attempt_count >= 6 then 'skipped' else 'failed' end,
         skip_reason = case when i.attempt_count >= 6 then 'delivery_failed' else null end,
         next_attempt_at = now() + make_interval(secs => least(
           86400,
           (900 * power(2, least(greatest(i.attempt_count - 1, 0), 7)))::integer
         )),
         locked_until = null,
         last_error_code = left(coalesce(nullif(p_error_code, ''), 'resend_request_failed'), 80),
         updated_at = now()
   where i.id = p_invitation_id
     and i.delivery_generation = p_delivery_generation
     and i.status = 'processing';
  return found;
end;
$$;

revoke all on function public.finish_product_review_invitation_delivery(uuid, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finish_product_review_invitation_delivery(uuid, integer, text, text, text)
  to service_role;

create or replace function public.record_resend_review_invitation_event(
  p_event_id text,
  p_event_type text,
  p_invitation_id uuid,
  p_provider_email_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation_id uuid;
begin
  if p_event_id is null
     or char_length(p_event_id) not between 1 and 200
     or p_event_type not in ('email.delivered', 'email.bounced', 'email.failed', 'email.complained')
     or (p_provider_email_id is not null and char_length(p_provider_email_id) > 200) then
    raise exception 'invalid_resend_review_invitation_event' using errcode = '22023';
  end if;

  insert into public.resend_review_invitation_events (event_id, event_type, invitation_id, provider_email_id)
  values (p_event_id, p_event_type, null, p_provider_email_id)
  on conflict (event_id) do nothing;
  if not found then return true; end if;

  select i.id
    into v_invitation_id
    from public.product_review_invitations i
   where p_provider_email_id is not null
     and i.provider_email_id = p_provider_email_id
     and (p_invitation_id is null or i.id = p_invitation_id)
   for update;
  if not found then return true; end if;

  update public.resend_review_invitation_events
     set invitation_id = v_invitation_id
   where event_id = p_event_id;

  if p_event_type = 'email.delivered' then
    update public.product_review_invitations
       set status = 'delivered', delivered_at = now(), locked_until = null, updated_at = now()
     where id = v_invitation_id and status = 'accepted';
  elsif p_event_type = 'email.complained' then
    update public.product_review_invitations
       set status = 'suppressed', delivered_at = null, locked_until = null,
           last_error_code = 'resend_complaint', updated_at = now()
     where id = v_invitation_id and status in ('accepted', 'delivered');
  elsif p_event_type = 'email.bounced' then
    update public.product_review_invitations
       set status = 'skipped', skip_reason = 'delivery_failed', delivered_at = null, locked_until = null,
           last_error_code = 'resend_bounced', updated_at = now()
     where id = v_invitation_id and status in ('accepted', 'delivered');
  else
    -- Resend could not send the message: retry with a new generation (new idempotency key and token).
    update public.product_review_invitations
       set status = case when attempt_count >= 6 then 'skipped' else 'failed' end,
           skip_reason = case when attempt_count >= 6 then 'delivery_failed' else null end,
           delivery_generation = delivery_generation + 1,
           provider_email_id = null,
           token_hash = null,
           token_expires_at = null,
           accepted_at = null,
           delivered_at = null,
           locked_until = null,
           next_attempt_at = now() + interval '1 hour',
           last_error_code = 'resend_delivery_failed',
           updated_at = now()
     where id = v_invitation_id
       and status = 'accepted'
       and token_used_at is null;
  end if;
  return true;
end;
$$;

revoke all on function public.record_resend_review_invitation_event(text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_resend_review_invitation_event(text, text, uuid, text)
  to service_role;

-- Buyer-facing token flow (called only by server routes with the service role).

create or replace function public.get_product_review_invitation(p_token_hash text)
returns table (
  state text,
  product_name text,
  product_description text,
  product_cover_image_path text,
  product_id uuid,
  storefront_username text,
  creator_name text,
  customer_name text,
  storefront_published boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  return query
  select case
           when i.token_used_at is not null or exists (
             select 1 from public.product_reviews r where r.invitation_id = i.id
           ) then 'used'
           when exists (
             select 1
               from public.product_reviews r
              where r.product_id = i.product_id
                and r.buyer_key = public.product_review_buyer_key(i.customer_email)
           ) then 'already_reviewed'
           when i.token_expires_at <= now() then 'expired'
           when o.order_status <> 'paid'
             or public.product_review_order_fully_refunded(o.id)
             or p.deleted_at is not null then 'ineligible'
           else 'valid'
         end,
         p.name,
         p.description,
         p.cover_image_path,
         p.id,
         s.username,
         s.store_name,
         o.customer_name,
         (s.status = 'published' and s.deleted_at is null and p.is_active and p.deleted_at is null)
    from public.product_review_invitations i
    join public.razorpay_checkout_orders o on o.id = i.order_id
    join public.storefront_products p on p.id = i.product_id
    join public.creator_storefronts s on s.id = i.storefront_id
   where i.token_hash = p_token_hash;
end;
$$;

revoke all on function public.get_product_review_invitation(text) from public, anon, authenticated;
grant execute on function public.get_product_review_invitation(text) to service_role;

create or replace function public.submit_product_review(
  p_token_hash text,
  p_rating integer,
  p_body text,
  p_reviewer_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation public.product_review_invitations%rowtype;
  v_order public.razorpay_checkout_orders%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_name text := regexp_replace(btrim(coalesce(p_reviewer_name, '')), '\s+', ' ', 'g');
  v_buyer_key text;
  v_review_id uuid;
begin
  if p_rating is null or p_rating not between 1 and 5
     or char_length(v_body) > 2000
     or char_length(v_name) not between 1 and 60 then
    raise exception 'invalid_product_review' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'review_token_invalid' using errcode = 'RVINV';
  end if;

  select i.*
    into v_invitation
    from public.product_review_invitations i
   where i.token_hash = p_token_hash
   for update;
  if not found then
    raise exception 'review_token_invalid' using errcode = 'RVINV';
  end if;
  if v_invitation.token_used_at is not null
     or exists (select 1 from public.product_reviews r where r.invitation_id = v_invitation.id) then
    raise exception 'review_token_used' using errcode = 'RVUSE';
  end if;
  if v_invitation.token_expires_at <= now() then
    raise exception 'review_token_expired' using errcode = 'RVEXP';
  end if;

  select o.*
    into v_order
    from public.razorpay_checkout_orders o
   where o.id = v_invitation.order_id;
  if not found
     or v_order.order_status <> 'paid'
     or v_order.product_id <> v_invitation.product_id
     or public.product_review_order_fully_refunded(v_order.id)
     or exists (
       select 1 from public.storefront_products p
        where p.id = v_invitation.product_id and p.deleted_at is not null
     ) then
    raise exception 'review_not_eligible' using errcode = 'RVINE';
  end if;

  v_buyer_key := public.product_review_buyer_key(v_order.customer_email);
  if exists (
    select 1 from public.product_reviews r
     where r.product_id = v_invitation.product_id and r.buyer_key = v_buyer_key
  ) then
    raise exception 'review_already_submitted' using errcode = 'RVUSE';
  end if;

  begin
    insert into public.product_reviews (
      invitation_id, order_id, creator_id, storefront_id, product_id,
      buyer_key, reviewer_name, rating, body
    )
    values (
      v_invitation.id, v_order.id, v_order.creator_id, v_order.storefront_id, v_order.product_id,
      v_buyer_key, v_name, p_rating, v_body
    )
    returning id into v_review_id;
  exception when unique_violation then
    raise exception 'review_already_submitted' using errcode = 'RVUSE';
  end;

  update public.product_review_invitations
     set token_used_at = now(),
         updated_at = now()
   where id = v_invitation.id;

  return v_review_id;
end;
$$;

revoke all on function public.submit_product_review(text, integer, text, text) from public, anon, authenticated;
grant execute on function public.submit_product_review(text, integer, text, text) to service_role;

-- Creator controls.

create or replace function public.get_my_product_review_summary()
returns table (review_count integer, average_rating numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer, round(avg(r.rating)::numeric, 2)
    from public.product_reviews r
   where r.creator_id = (select auth.uid())
     and r.status = 'published';
$$;

revoke all on function public.get_my_product_review_summary() from public, anon;
grant execute on function public.get_my_product_review_summary() to authenticated, service_role;

create or replace function public.report_product_review(
  p_review_id uuid,
  p_reason text,
  p_details text default ''
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_details text := btrim(coalesce(p_details, ''));
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_reason not in ('spam', 'offensive', 'fraudulent', 'not_about_product', 'other')
     or char_length(v_details) > 1000 then
    raise exception 'invalid_review_report' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.product_reviews r
     where r.id = p_review_id and r.creator_id = v_user_id
  ) then
    raise exception 'review_not_found' using errcode = 'P0002';
  end if;

  insert into public.product_review_reports (review_id, reporter_id, reason, details)
  values (p_review_id, v_user_id, p_reason, v_details)
  on conflict (review_id, reporter_id) do update
    set reason = excluded.reason,
        details = excluded.details,
        status = 'open',
        resolution_note = null,
        resolved_at = null,
        resolved_by = null,
        updated_at = now();
end;
$$;

revoke all on function public.report_product_review(uuid, text, text) from public, anon;
grant execute on function public.report_product_review(uuid, text, text) to authenticated;

-- Platform moderation (admin only).

create or replace function public.admin_list_product_review_reports(p_status text default 'open')
returns table (
  report_id uuid,
  report_status text,
  reason text,
  details text,
  reported_at timestamptz,
  review_id uuid,
  review_status text,
  rating smallint,
  body text,
  reviewer_name text,
  submitted_at timestamptz,
  product_id uuid,
  product_name text,
  storefront_username text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_cloverloop_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  return query
  select rep.id, rep.status, rep.reason, rep.details, rep.created_at,
         r.id, r.status, r.rating, r.body, r.reviewer_name, r.submitted_at,
         p.id, p.name, s.username
    from public.product_review_reports rep
    join public.product_reviews r on r.id = rep.review_id
    join public.storefront_products p on p.id = r.product_id
    join public.creator_storefronts s on s.id = r.storefront_id
   where p_status is null or rep.status = p_status
   order by rep.created_at desc
   limit 200;
end;
$$;

revoke all on function public.admin_list_product_review_reports(text) from public, anon;
grant execute on function public.admin_list_product_review_reports(text) to authenticated;

create or replace function public.admin_moderate_product_review(
  p_review_id uuid,
  p_action text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_cloverloop_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_action not in ('hide', 'restore', 'dismiss_reports')
     or (v_note is not null and char_length(v_note) > 500) then
    raise exception 'invalid_review_moderation' using errcode = '22023';
  end if;
  if not exists (select 1 from public.product_reviews where id = p_review_id) then
    raise exception 'review_not_found' using errcode = 'P0002';
  end if;

  if p_action in ('hide', 'restore') then
    update public.product_reviews
       set status = case when p_action = 'hide' then 'hidden' else 'published' end,
           moderation_note = v_note,
           moderated_at = now(),
           updated_at = now()
     where id = p_review_id;
  end if;

  update public.product_review_reports
     set status = case when p_action = 'hide' then 'resolved' else 'dismissed' end,
         resolution_note = v_note,
         resolved_at = now(),
         resolved_by = (select auth.uid()),
         updated_at = now()
   where review_id = p_review_id
     and status = 'open';
end;
$$;

revoke all on function public.admin_moderate_product_review(uuid, text, text) from public, anon;
grant execute on function public.admin_moderate_product_review(uuid, text, text) to authenticated;
