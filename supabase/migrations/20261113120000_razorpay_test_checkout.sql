create table if not exists public.razorpay_checkout_orders (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  storefront_id uuid not null references public.creator_storefronts(id) on delete restrict,
  product_id uuid not null references public.storefront_products(id) on delete restrict,
  storefront_username text not null,
  customer_email text not null,
  customer_name text,
  customer_phone text,
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  environment text not null default 'test' check (environment = 'test'),
  checkout_token_hash text not null unique,
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  order_status text not null default 'pending'
    check (order_status in ('pending', 'paid', 'failed')),
  payment_status text not null default 'created'
    check (payment_status in ('created', 'authorized', 'captured', 'failed')),
  fulfillment_status text not null default 'pending'
    check (fulfillment_status in ('pending', 'ready', 'blocked')),
  provider_creation_status text not null default 'creating'
    check (provider_creation_status in ('creating', 'failed', 'created')),
  provider_creation_started_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint razorpay_checkout_orders_product_owner_fk
    foreign key (product_id, storefront_id, creator_id)
    references public.storefront_products(id, storefront_id, user_id)
    on delete restrict
);

create index if not exists razorpay_checkout_orders_creator_created_idx
  on public.razorpay_checkout_orders (creator_id, created_at desc);
create index if not exists razorpay_checkout_orders_status_idx
  on public.razorpay_checkout_orders (order_status, created_at);

create table if not exists public.razorpay_checkout_webhooks (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  razorpay_account_id text not null,
  environment text not null check (environment = 'test'),
  razorpay_webhook_id text not null,
  webhook_url text not null,
  created_at timestamptz not null default now(),
  unique (creator_id, razorpay_account_id, environment),
  unique (razorpay_webhook_id)
);

create table if not exists public.razorpay_checkout_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  razorpay_account_id text,
  environment text not null default 'test' check (environment = 'test'),
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.razorpay_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.razorpay_checkout_orders(id) on delete cascade,
  razorpay_payment_id text not null unique,
  payment_status text not null
    check (payment_status in ('created', 'authorized', 'captured', 'failed')),
  amount_paise integer not null check (amount_paise > 0),
  currency text not null check (currency = 'INR'),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists razorpay_payment_attempts_order_idx
  on public.razorpay_payment_attempts (order_id, created_at desc);

create table if not exists public.product_purchase_entitlements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.razorpay_checkout_orders(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  storefront_id uuid not null references public.creator_storefronts(id) on delete restrict,
  product_id uuid not null references public.storefront_products(id) on delete restrict,
  customer_email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  download_count integer not null default 0 check (download_count >= 0),
  max_downloads integer not null check (max_downloads between 1 and 20),
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_purchase_entitlements_product_owner_fk
    foreign key (product_id, storefront_id, creator_id)
    references public.storefront_products(id, storefront_id, user_id)
    on delete restrict
);

create index if not exists product_purchase_entitlements_creator_idx
  on public.product_purchase_entitlements (creator_id, created_at desc);
create index if not exists product_purchase_entitlements_expiry_idx
  on public.product_purchase_entitlements (expires_at)
  where status = 'active';

alter table public.razorpay_checkout_orders enable row level security;
alter table public.razorpay_checkout_webhooks enable row level security;
alter table public.razorpay_checkout_events enable row level security;
alter table public.razorpay_payment_attempts enable row level security;
alter table public.product_purchase_entitlements enable row level security;

revoke all on public.razorpay_checkout_orders from anon, authenticated;
revoke all on public.razorpay_checkout_webhooks from anon, authenticated;
revoke all on public.razorpay_checkout_events from anon, authenticated;
revoke all on public.razorpay_payment_attempts from anon, authenticated;
revoke all on public.product_purchase_entitlements from anon, authenticated;
grant select on public.razorpay_checkout_orders to authenticated;
grant select on public.razorpay_payment_attempts to authenticated;
grant select on public.product_purchase_entitlements to authenticated;
grant all on public.razorpay_checkout_orders to service_role;
grant all on public.razorpay_checkout_webhooks to service_role;
grant all on public.razorpay_checkout_events to service_role;
grant all on public.razorpay_payment_attempts to service_role;
grant all on public.product_purchase_entitlements to service_role;

create policy "Creators can read their checkout orders"
  on public.razorpay_checkout_orders
  for select to authenticated
  using (creator_id = (select auth.uid()));

create policy "Creators can read their payment attempts"
  on public.razorpay_payment_attempts
  for select to authenticated
  using (
    exists (
      select 1
      from public.razorpay_checkout_orders o
      where o.id = order_id
        and o.creator_id = (select auth.uid())
    )
  );

create policy "Creators can read their purchase entitlements"
  on public.product_purchase_entitlements
  for select to authenticated
  using (creator_id = (select auth.uid()));

create or replace function public.create_razorpay_checkout_order(
  p_product_id uuid,
  p_storefront_username text,
  p_customer_email text,
  p_customer_name text,
  p_customer_phone text,
  p_checkout_token_hash text
)
returns table (
  order_id uuid,
  creator_id uuid,
  storefront_id uuid,
  storefront_name text,
  storefront_username text,
  product_id uuid,
  product_name text,
  product_description text,
  amount_paise integer,
  currency text,
  razorpay_order_id text,
  should_create_provider_order boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.storefront_products%rowtype;
  v_store public.creator_storefronts%rowtype;
  v_order public.razorpay_checkout_orders%rowtype;
  v_should_create boolean := false;
begin
  if p_checkout_token_hash !~ '^[0-9a-f]{64}$'
     or p_customer_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(p_storefront_username) > 80 then
    raise exception 'invalid_checkout_input' using errcode = '22023';
  end if;

  select *
    into v_order
    from public.razorpay_checkout_orders o
   where o.checkout_token_hash = p_checkout_token_hash
   for update;

  if found then
    if v_order.product_id <> p_product_id
       or v_order.storefront_username <> p_storefront_username
       or v_order.customer_email <> lower(trim(p_customer_email)) then
      raise exception 'checkout_key_conflict' using errcode = '22023';
    end if;
    if v_order.order_status = 'paid' then
      raise exception 'checkout_already_paid' using errcode = '22023';
    end if;
    if v_order.order_status = 'failed' then
      raise exception 'checkout_order_failed' using errcode = '22023';
    end if;

    if v_order.razorpay_order_id is null
       and v_order.provider_creation_status = 'failed' then
      update public.razorpay_checkout_orders o
         set provider_creation_status = 'creating',
             provider_creation_started_at = now(),
             updated_at = now()
       where o.id = v_order.id
       returning * into v_order;
      v_should_create := true;
    end if;

    select p.*
      into v_product
      from public.storefront_products p
      join public.creator_storefronts s on s.id = p.storefront_id
     where p.id = v_order.product_id
       and p.storefront_id = v_order.storefront_id
       and p.user_id = v_order.creator_id
       and p.is_active
       and p.deleted_at is null
       and not p.is_free
       and p.price_paise = v_order.amount_paise
       and p.price_paise >= 100
       and nullif(trim(p.file_path), '') is not null
       and s.username = v_order.storefront_username
       and s.status = 'published'
       and s.deleted_at is null;
    if not found then
      raise exception 'product_not_available' using errcode = 'P0002';
    end if;

    return query
      select v_order.id, v_order.creator_id, v_order.storefront_id,
             s.store_name, v_order.storefront_username, v_order.product_id,
             v_product.name, v_product.description, v_order.amount_paise, v_order.currency,
             v_order.razorpay_order_id, v_should_create
        from public.creator_storefronts s
       where s.id = v_order.storefront_id
         and s.status = 'published'
         and s.deleted_at is null;
    return;
  end if;

  select p.*
    into v_product
    from public.storefront_products p
    join public.creator_storefronts s on s.id = p.storefront_id
   where p.id = p_product_id
     and s.username = p_storefront_username
     and s.status = 'published'
     and s.deleted_at is null
     and p.is_active
     and p.deleted_at is null
     and not p.is_free
     and p.price_paise >= 100
     and nullif(trim(p.file_path), '') is not null;

  if not found then
    raise exception 'product_not_available' using errcode = 'P0002';
  end if;

  select s.*
    into v_store
    from public.creator_storefronts s
   where s.id = v_product.storefront_id
     and s.status = 'published'
     and s.deleted_at is null;

  insert into public.razorpay_checkout_orders (
    creator_id, storefront_id, product_id, storefront_username,
    customer_email, customer_name, customer_phone, amount_paise,
    checkout_token_hash
  )
  values (
    v_product.user_id, v_product.storefront_id, v_product.id,
    v_store.username, lower(trim(p_customer_email)),
    nullif(trim(p_customer_name), ''), nullif(trim(p_customer_phone), ''),
    v_product.price_paise, p_checkout_token_hash
  )
  returning * into v_order;

  return query
    select v_order.id, v_order.creator_id, v_order.storefront_id,
           v_store.store_name, v_store.username, v_product.id,
           v_product.name, v_product.description, v_order.amount_paise,
           v_order.currency, v_order.razorpay_order_id, true;
end;
$$;

revoke all on function public.create_razorpay_checkout_order(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_razorpay_checkout_order(uuid, text, text, text, text, text)
  to service_role;

create or replace function public.mark_razorpay_checkout_order_failed(p_order_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.razorpay_checkout_orders
     set provider_creation_status = 'failed',
         updated_at = now()
   where id = p_order_id
     and razorpay_order_id is null
     and provider_creation_status = 'creating';
$$;

revoke all on function public.mark_razorpay_checkout_order_failed(uuid)
  from public, anon, authenticated;
grant execute on function public.mark_razorpay_checkout_order_failed(uuid)
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

  if p_amount_paise <> v_order.amount_paise
     or p_currency <> v_order.currency
     or p_payment_status not in ('authorized', 'captured', 'failed')
     or p_max_downloads < 1 or p_max_downloads > 20
     or p_expiry_hours < 1 or p_expiry_hours > 168 then
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
    verified_at = now();

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

create or replace function public.record_paid_product_download(p_token_hash text)
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
    join public.razorpay_checkout_orders o on o.id = e.order_id
    join public.storefront_products p on p.id = e.product_id
    join public.creator_storefronts s on s.id = e.storefront_id
   where e.token_hash = p_token_hash
     and e.status = 'active'
     and e.expires_at > now()
     and e.download_count < e.max_downloads
     and o.order_status = 'paid'
     and o.fulfillment_status = 'ready'
     and p.is_active
     and p.deleted_at is null
     and p.user_id = e.creator_id
     and p.storefront_id = e.storefront_id
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

revoke all on function public.record_paid_product_download(text)
  from public, anon, authenticated;
grant execute on function public.record_paid_product_download(text)
  to service_role;
