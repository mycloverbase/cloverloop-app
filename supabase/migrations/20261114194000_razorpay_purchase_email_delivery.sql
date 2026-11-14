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
  product.cover_image_path,
  product.file_name,
  product.file_size,
  product.file_mime_type
from public.storefront_products product
join public.creator_storefronts storefront on storefront.id = product.storefront_id
where storefront.status = 'published'
  and storefront.deleted_at is null
  and product.is_active
  and product.deleted_at is null;

create table public.razorpay_purchase_emails (
  order_id uuid primary key references public.razorpay_checkout_orders(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'accepted', 'delivered', 'failed', 'suppressed')),
  delivery_generation integer not null default 0 check (delivery_generation >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_email_id text unique,
  accepted_at timestamptz,
  delivered_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'processing' and locked_until is not null)
    or (status <> 'processing' and locked_until is null)
  ),
  check (
    (status in ('accepted', 'delivered', 'suppressed') and provider_email_id is not null)
    or (status in ('pending', 'processing', 'failed') and provider_email_id is null)
  ),
  check ((status = 'delivered') = (delivered_at is not null))
);

create index razorpay_purchase_emails_retry_idx
  on public.razorpay_purchase_emails (next_attempt_at, created_at)
  where status in ('pending', 'failed', 'processing');

alter table public.razorpay_purchase_emails enable row level security;
revoke all on public.razorpay_purchase_emails from public, anon, authenticated;
grant all on public.razorpay_purchase_emails to service_role;

create table public.resend_purchase_email_events (
  event_id text primary key check (char_length(event_id) between 1 and 200),
  event_type text not null,
  order_id uuid references public.razorpay_checkout_orders(id) on delete set null,
  provider_email_id text,
  created_at timestamptz not null default now()
);

alter table public.resend_purchase_email_events enable row level security;
revoke all on public.resend_purchase_email_events from public, anon, authenticated;
grant all on public.resend_purchase_email_events to service_role;

create or replace function public.enqueue_razorpay_purchase_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.razorpay_purchase_emails (order_id)
  values (new.order_id)
  on conflict (order_id) do nothing;
  return new;
end;
$$;

revoke all on function public.enqueue_razorpay_purchase_email()
  from public, anon, authenticated;

create trigger enqueue_razorpay_purchase_email_after_entitlement
  after insert on public.product_purchase_entitlements
  for each row execute function public.enqueue_razorpay_purchase_email();

create or replace function public.claim_razorpay_purchase_email_deliveries(
  p_order_id uuid default null,
  p_batch_size integer default 1
)
returns table (
  order_id uuid,
  delivery_generation integer,
  customer_email text,
  customer_name text,
  product_name text,
  storefront_name text,
  amount_paise integer,
  currency text,
  razorpay_order_id text,
  expires_at timestamptz,
  max_downloads integer
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select e.order_id
      from public.razorpay_purchase_emails e
     where (
         e.status in ('pending', 'failed')
         or (e.status = 'processing' and e.locked_until <= now())
       )
       and e.next_attempt_at <= now()
       and e.status <> 'suppressed'
       and (p_order_id is null or e.order_id = p_order_id)
       and exists (
         select 1
           from public.razorpay_checkout_orders o
           join public.product_purchase_entitlements entitlement
             on entitlement.order_id = o.id
          where o.id = e.order_id
            and o.order_status = 'paid'
            and o.fulfillment_status = 'ready'
            and entitlement.status = 'active'
            and entitlement.expires_at > now()
       )
     order by e.next_attempt_at, e.created_at
     for update skip locked
     limit least(greatest(coalesce(p_batch_size, 1), 1), 10)
  ),
  claimed as (
    update public.razorpay_purchase_emails e
       set status = 'processing',
           attempt_count = e.attempt_count + 1,
           locked_until = now() + interval '60 seconds',
           last_error_code = null,
           updated_at = now()
      from candidates c
     where e.order_id = c.order_id
     returning e.order_id, e.delivery_generation
  )
  select c.order_id,
         c.delivery_generation,
         o.customer_email,
         o.customer_name,
         product.name,
         storefront.store_name,
         o.amount_paise,
         o.currency,
         o.razorpay_order_id,
         entitlement.expires_at,
         entitlement.max_downloads
    from claimed c
    join public.razorpay_checkout_orders o on o.id = c.order_id
    join public.storefront_products product
      on product.id = o.product_id
     and product.storefront_id = o.storefront_id
     and product.user_id = o.creator_id
    join public.creator_storefronts storefront
      on storefront.id = o.storefront_id
     and storefront.user_id = o.creator_id
    join public.product_purchase_entitlements entitlement
      on entitlement.order_id = o.id
   where o.order_status = 'paid'
     and o.fulfillment_status = 'ready'
     and entitlement.status = 'active'
     and entitlement.expires_at > now();
$$;

revoke all on function public.claim_razorpay_purchase_email_deliveries(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_razorpay_purchase_email_deliveries(uuid, integer)
  to service_role;

create or replace function public.finish_razorpay_purchase_email_delivery(
  p_order_id uuid,
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
  v_updated integer;
  v_current_status text;
  v_current_generation integer;
  v_event_type text;
begin
  if p_status not in ('accepted', 'failed')
     or (p_status = 'accepted' and (
       p_provider_email_id is null or char_length(p_provider_email_id) > 200
     )) then
    raise exception 'invalid_purchase_email_delivery_state' using errcode = '22023';
  end if;

  update public.razorpay_purchase_emails e
     set status = p_status,
         provider_email_id = case
           when p_status = 'accepted' then p_provider_email_id
           else null
         end,
         accepted_at = case
           when p_status = 'accepted' then now()
           else null
         end,
         next_attempt_at = case
           when p_status = 'failed' then
             now() + make_interval(secs => least(
               3600,
               (15 * power(2, least(greatest(e.attempt_count - 1, 0), 8)))::integer
             ))
           else now()
         end,
         locked_until = null,
         last_error_code = case
           when p_status = 'failed' then left(
             coalesce(nullif(p_error_code, ''), 'resend_request_failed'),
             80
           )
           else null
         end,
         updated_at = now()
   where e.order_id = p_order_id
     and e.delivery_generation = p_delivery_generation
     and e.status = 'processing';

  get diagnostics v_updated = row_count;
  if v_updated = 1 then
    if p_status = 'accepted' then
      update public.resend_purchase_email_events event
         set order_id = p_order_id
       where event.provider_email_id = p_provider_email_id
         and event.order_id is null;

      select event.event_type
        into v_event_type
        from public.resend_purchase_email_events event
       where event.order_id = p_order_id
         and event.provider_email_id = p_provider_email_id
       order by event.created_at desc
       limit 1;

      if v_event_type = 'email.delivered' then
        update public.razorpay_purchase_emails
           set status = 'delivered',
               delivered_at = now(),
               last_error_code = null,
               updated_at = now()
         where order_id = p_order_id
           and status = 'accepted';
      elsif v_event_type = 'email.complained' then
        update public.razorpay_purchase_emails
           set status = 'suppressed',
               last_error_code = 'resend_complaint',
               updated_at = now()
         where order_id = p_order_id
           and status = 'accepted';
      elsif v_event_type in ('email.bounced', 'email.failed') then
        update public.razorpay_purchase_emails
           set status = 'failed',
               delivery_generation = delivery_generation + 1,
               attempt_count = 0,
               provider_email_id = null,
               accepted_at = null,
               next_attempt_at = now(),
               last_error_code = 'resend_delivery_failed',
               updated_at = now()
         where order_id = p_order_id
           and status = 'accepted';
      end if;
    end if;
    return true;
  end if;

  select e.status, e.delivery_generation
    into v_current_status, v_current_generation
    from public.razorpay_purchase_emails e
   where e.order_id = p_order_id;
  return v_current_status = 'delivered'
     and v_current_generation = p_delivery_generation;
end;
$$;

revoke all on function public.finish_razorpay_purchase_email_delivery(uuid, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finish_razorpay_purchase_email_delivery(uuid, integer, text, text, text)
  to service_role;

create or replace function public.record_resend_purchase_email_event(
  p_event_id text,
  p_event_type text,
  p_order_id uuid,
  p_provider_email_id text,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_updated integer;
begin
  if p_event_id is null
     or char_length(p_event_id) not between 1 and 200
     or p_status not in ('delivered', 'failed', 'suppressed')
     or (p_provider_email_id is not null and char_length(p_provider_email_id) > 200) then
    raise exception 'invalid_resend_purchase_email_event' using errcode = '22023';
  end if;

  insert into public.resend_purchase_email_events (
    event_id, event_type, order_id, provider_email_id
  )
  values (p_event_id, p_event_type, p_order_id, p_provider_email_id)
  on conflict (event_id) do nothing;
  if not found then return true; end if;

  if p_order_id is not null
     and p_provider_email_id is not null
     and exists (
       select 1
         from public.razorpay_purchase_emails e
        where e.provider_email_id = p_provider_email_id
          and e.order_id <> p_order_id
     ) then
    raise exception 'resend_purchase_email_order_conflict' using errcode = '22023';
  end if;

  select e.order_id
    into v_order_id
    from public.razorpay_purchase_emails e
   where (p_order_id is not null and e.order_id = p_order_id)
      or (p_provider_email_id is not null and e.provider_email_id = p_provider_email_id)
   order by (e.order_id = p_order_id) desc
   limit 1
   for update;

  if not found then return true; end if;

  update public.resend_purchase_email_events
     set order_id = v_order_id
   where event_id = p_event_id;

  if p_provider_email_id is null or not exists (
    select 1
      from public.razorpay_purchase_emails e
     where e.order_id = v_order_id
       and e.provider_email_id = p_provider_email_id
  ) then
    return true;
  end if;

  if p_status = 'delivered' then
    update public.razorpay_purchase_emails e
       set status = 'delivered',
           provider_email_id = coalesce(p_provider_email_id, e.provider_email_id),
           accepted_at = coalesce(e.accepted_at, now()),
           delivered_at = now(),
           locked_until = null,
           last_error_code = null,
           updated_at = now()
     where e.order_id = v_order_id
       and e.status <> 'delivered';
  elsif p_status = 'suppressed' then
    update public.razorpay_purchase_emails e
       set status = 'suppressed',
           provider_email_id = coalesce(p_provider_email_id, e.provider_email_id),
           accepted_at = coalesce(e.accepted_at, now()),
           delivered_at = null,
           locked_until = null,
           last_error_code = 'resend_complaint',
           updated_at = now()
     where e.order_id = v_order_id
       and e.status not in ('delivered', 'suppressed');
  else
    update public.razorpay_purchase_emails e
       set status = 'failed',
           delivery_generation = e.delivery_generation + 1,
           attempt_count = 0,
           provider_email_id = null,
           accepted_at = null,
           delivered_at = null,
           next_attempt_at = now(),
           locked_until = null,
           last_error_code = 'resend_delivery_failed',
           updated_at = now()
     where e.order_id = v_order_id
       and e.status not in ('delivered', 'failed');
  end if;

  get diagnostics v_updated = row_count;
  return true;
end;
$$;

revoke all on function public.record_resend_purchase_email_event(text, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_resend_purchase_email_event(text, text, uuid, text, text)
  to service_role;

alter table public.product_claims
  add column customer_name text check (
    customer_name is null
    or char_length(btrim(customer_name)) between 1 and 120
  );

create or replace function public.record_paid_product_download_by_order(p_order_id uuid)
returns table (download_count integer, max_downloads integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entitlement public.product_purchase_entitlements%rowtype;
begin
  select e.*
    into v_entitlement
    from public.product_purchase_entitlements e
    join public.razorpay_checkout_orders o
      on o.id = e.order_id
     and o.creator_id = e.creator_id
     and o.storefront_id = e.storefront_id
     and o.product_id = e.product_id
    join public.storefront_products p
      on p.id = e.product_id
     and p.storefront_id = e.storefront_id
     and p.user_id = e.creator_id
    join public.creator_storefronts s
      on s.id = e.storefront_id
     and s.user_id = e.creator_id
   where e.order_id = p_order_id
     and e.status = 'active'
     and e.expires_at > now()
     and e.download_count < e.max_downloads
     and o.order_status = 'paid'
     and o.fulfillment_status = 'ready'
     and p.is_active
     and p.deleted_at is null
     and nullif(trim(p.file_path), '') is not null
     and s.status = 'published'
     and s.deleted_at is null
   for update of e;

  if not found then
    raise exception 'purchase_download_not_available' using errcode = 'P0002';
  end if;

  update public.product_purchase_entitlements e
     set download_count = e.download_count + 1,
         updated_at = now()
   where e.id = v_entitlement.id
   returning e.download_count, e.max_downloads
        into download_count, max_downloads;

  return next;
end;
$$;

revoke all on function public.record_paid_product_download_by_order(uuid)
  from public, anon, authenticated;
grant execute on function public.record_paid_product_download_by_order(uuid)
  to service_role;
