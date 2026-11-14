alter table public.razorpay_checkout_events
  add column if not exists creator_id uuid references auth.users(id) on delete set null,
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists locked_until timestamptz,
  add column if not exists last_error_code text;

alter table public.razorpay_checkout_events
  drop constraint if exists razorpay_checkout_events_processing_status_check;

alter table public.razorpay_checkout_events
  add constraint razorpay_checkout_events_processing_status_check
  check (processing_status in ('received', 'processing', 'processed', 'ignored', 'failed'));

alter table public.razorpay_checkout_events
  add constraint razorpay_checkout_events_attempt_count_check
  check (attempt_count >= 0),
  add constraint razorpay_checkout_events_last_error_code_check
  check (last_error_code is null or char_length(last_error_code) <= 80);

create index if not exists razorpay_checkout_events_partner_retry_idx
  on public.razorpay_checkout_events (next_attempt_at, created_at)
  where event_type = 'payment.captured'
    and processing_status in ('received', 'failed', 'processing');

create or replace function public.claim_razorpay_partner_webhook_events(
  p_event_id text default null,
  p_batch_size integer default 1
)
returns table (
  event_id text,
  creator_id uuid,
  razorpay_account_id text,
  razorpay_order_id text,
  razorpay_payment_id text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select e.id
      from public.razorpay_checkout_events e
     where e.event_type = 'payment.captured'
       and e.environment = 'test'
       and e.creator_id is not null
       and e.razorpay_account_id is not null
       and e.razorpay_order_id is not null
       and e.razorpay_payment_id is not null
       and (
         e.processing_status in ('received', 'failed')
         or (e.processing_status = 'processing' and e.locked_until <= now())
       )
       and e.next_attempt_at <= now()
       and (p_event_id is null or e.event_id = p_event_id)
     order by e.next_attempt_at, e.created_at
     for update skip locked
     limit least(greatest(coalesce(p_batch_size, 1), 1), 10)
  ),
  claimed as (
    update public.razorpay_checkout_events e
       set processing_status = 'processing',
           attempt_count = e.attempt_count + 1,
           locked_until = now() + interval '60 seconds',
           last_error_code = null
      from candidates c
     where e.id = c.id
     returning e.event_id, e.creator_id, e.razorpay_account_id,
               e.razorpay_order_id, e.razorpay_payment_id
  )
  select c.event_id, c.creator_id, c.razorpay_account_id,
         c.razorpay_order_id, c.razorpay_payment_id
    from claimed c;
$$;

revoke all on function public.claim_razorpay_partner_webhook_events(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_razorpay_partner_webhook_events(text, integer)
  to service_role;

create or replace function public.finish_razorpay_partner_webhook_event(
  p_event_id text,
  p_processing_status text,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  if p_processing_status not in ('processed', 'ignored', 'failed') then
    raise exception 'invalid_webhook_processing_status' using errcode = '22023';
  end if;

  update public.razorpay_checkout_events e
     set processing_status = p_processing_status,
         processed_at = case
           when p_processing_status = 'failed' then null
           else now()
         end,
         next_attempt_at = case
           when p_processing_status = 'failed' then
             now() + make_interval(secs => least(
               3600,
               (15 * power(2, least(greatest(e.attempt_count - 1, 0), 8)))::integer
             ))
           else now()
         end,
         locked_until = null,
         last_error_code = case
           when p_processing_status = 'failed' then left(
             coalesce(nullif(p_error_code, ''), 'processing_failed'),
             80
           )
           else null
         end
   where e.event_id = p_event_id
     and e.processing_status = 'processing';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.finish_razorpay_partner_webhook_event(text, text, text)
  from public, anon, authenticated;
grant execute on function public.finish_razorpay_partner_webhook_event(text, text, text)
  to service_role;

create or replace function public.record_razorpay_checkout_payment(
  p_order_id uuid,
  p_payment_id text,
  p_amount_paise integer,
  p_currency text,
  p_payment_status text,
  p_captured boolean,
  p_max_downloads integer,
  p_expiry_hours integer
)
returns table (order_status text, fulfillment_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.razorpay_checkout_orders%rowtype;
  v_product public.storefront_products%rowtype;
  v_store public.creator_storefronts%rowtype;
  v_attempt_order_id uuid;
  v_fulfillment text := 'pending';
begin
  select *
    into v_order
    from public.razorpay_checkout_orders o
   where o.id = p_order_id
     and o.environment = 'test'
     and o.razorpay_order_id is not null
   for update;

  if not found then
    raise exception 'checkout_order_not_found' using errcode = 'P0002';
  end if;

  if p_payment_id is null
     or p_amount_paise is null
     or p_currency is null
     or p_payment_status is null
     or p_captured is null
     or p_payment_id !~ '^pay_[A-Za-z0-9]+$'
     or p_amount_paise <> v_order.amount_paise
     or p_currency <> v_order.currency
     or p_payment_status not in ('authorized', 'captured', 'failed')
     or p_captured <> (p_payment_status = 'captured')
     or p_max_downloads < 1 or p_max_downloads > 20
     or p_expiry_hours < 1 or p_expiry_hours > 168
     or (v_order.razorpay_payment_id is not null
         and v_order.razorpay_payment_id <> p_payment_id) then
    raise exception 'checkout_payment_mismatch' using errcode = '22023';
  end if;

  insert into public.razorpay_payment_attempts (
    order_id, razorpay_payment_id, payment_status, amount_paise, currency
  )
  values (
    p_order_id, p_payment_id, p_payment_status, p_amount_paise, p_currency
  )
  on conflict (razorpay_payment_id) do update
    set payment_status = case
      when public.razorpay_payment_attempts.payment_status = 'captured'
        then 'captured'
      else excluded.payment_status
    end,
    verified_at = now()
    where public.razorpay_payment_attempts.order_id = excluded.order_id
  returning order_id into v_attempt_order_id;

  if not found or v_attempt_order_id <> p_order_id then
    raise exception 'checkout_payment_conflict' using errcode = '22023';
  end if;

  if p_captured and p_payment_status = 'captured' then
    update public.razorpay_checkout_orders o
       set order_status = 'paid',
           payment_status = 'captured',
           razorpay_payment_id = coalesce(o.razorpay_payment_id, p_payment_id),
           paid_at = coalesce(o.paid_at, now()),
           updated_at = now()
     where o.id = p_order_id
       and o.order_status <> 'paid';

    select p.*
      into v_product
      from public.storefront_products p
      join public.creator_storefronts s on s.id = p.storefront_id
     where p.id = v_order.product_id
       and p.storefront_id = v_order.storefront_id
       and p.user_id = v_order.creator_id
       and p.is_active
       and p.deleted_at is null
       and nullif(trim(p.file_path), '') is not null
       and s.username = v_order.storefront_username
       and s.status = 'published'
       and s.deleted_at is null;

    if found then
      v_fulfillment := 'ready';
      insert into public.product_purchase_entitlements (
        order_id, creator_id, storefront_id, product_id, customer_email,
        token_hash, expires_at, max_downloads
      )
      values (
        v_order.id, v_order.creator_id, v_order.storefront_id,
        v_order.product_id, v_order.customer_email,
        v_order.checkout_token_hash,
        now() + make_interval(hours => p_expiry_hours),
        p_max_downloads
      )
      on conflict (order_id) do nothing;
    else
      v_fulfillment := 'blocked';
    end if;

    update public.razorpay_checkout_orders o
       set fulfillment_status = case
         when o.fulfillment_status = 'ready' then 'ready'
         else v_fulfillment
       end,
       updated_at = now()
     where o.id = p_order_id;
  elsif p_payment_status = 'failed' then
    update public.razorpay_checkout_orders o
       set payment_status = case
         when o.payment_status = 'captured' then 'captured'
         else 'failed'
       end,
       updated_at = now()
     where o.id = p_order_id;
  else
    update public.razorpay_checkout_orders o
       set payment_status = case
         when o.payment_status = 'captured' then 'captured'
         else 'authorized'
       end,
       updated_at = now()
     where o.id = p_order_id;
  end if;

  return query
    select o.order_status, o.fulfillment_status
      from public.razorpay_checkout_orders o
     where o.id = p_order_id;
end;
$$;

revoke all on function public.record_razorpay_checkout_payment(uuid, text, integer, text, text, boolean, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_razorpay_checkout_payment(uuid, text, integer, text, text, boolean, integer, integer)
  to service_role;
