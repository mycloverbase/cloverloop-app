alter table public.creator_razorpay_connections
  drop constraint creator_razorpay_connections_pkey,
  add primary key (creator_id, environment);

drop index if exists public.creator_razorpay_connections_account_active_idx;
create unique index creator_razorpay_connections_account_active_idx
  on public.creator_razorpay_connections (environment, razorpay_account_id)
  where connection_status in ('connected', 'reconnect_required');

create or replace function public.save_razorpay_connection(
  requested_creator_id uuid,
  requested_razorpay_account_id text,
  requested_client_id text,
  requested_environment text,
  requested_public_token text,
  requested_access_token_encrypted text,
  requested_refresh_token_encrypted text,
  requested_token_expires_at timestamptz,
  requested_refresh_token_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_creator_id uuid;
begin
  if requested_creator_id is null
    or requested_razorpay_account_id is null
    or requested_razorpay_account_id !~ '^acc_[A-Za-z0-9]+$'
    or requested_client_id is null
    or requested_environment is null
    or requested_environment not in ('test', 'live')
    or requested_public_token is null
    or requested_access_token_encrypted is null
    or requested_refresh_token_encrypted is null
    or requested_token_expires_at is null
    or requested_token_expires_at <= now()
    or requested_refresh_token_expires_at is null
    or requested_refresh_token_expires_at <= now() then
    raise exception 'Invalid Razorpay connection details';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(requested_creator_id::text),
    hashtext('razorpay-connection')
  );

  insert into public.creator_razorpay_connections (
    creator_id, razorpay_account_id, client_id, environment, granted_scope,
    public_token, access_token_encrypted, refresh_token_encrypted,
    token_expires_at, refresh_token_expires_at, connection_status,
    connected_at, disconnected_at, last_refreshed_at, last_error_code,
    refresh_lock_token, refresh_lock_expires_at
  ) values (
    requested_creator_id, requested_razorpay_account_id, requested_client_id,
    requested_environment, 'read_write', requested_public_token,
    requested_access_token_encrypted, requested_refresh_token_encrypted,
    requested_token_expires_at, requested_refresh_token_expires_at,
    'connected', now(), null, now(), null, null, null
  )
  on conflict (creator_id, environment) do update
  set razorpay_account_id = excluded.razorpay_account_id,
      client_id = excluded.client_id,
      granted_scope = excluded.granted_scope,
      public_token = excluded.public_token,
      access_token_encrypted = excluded.access_token_encrypted,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      token_expires_at = excluded.token_expires_at,
      refresh_token_expires_at = excluded.refresh_token_expires_at,
      connection_status = 'connected',
      connected_at = now(),
      disconnected_at = null,
      last_refreshed_at = now(),
      last_error_code = null,
      refresh_lock_token = null,
      refresh_lock_expires_at = null
  where public.creator_razorpay_connections.connection_status in (
      'disconnected', 'revoked', 'reconnect_required'
    )
    or (
      public.creator_razorpay_connections.connection_status = 'connected'
      and public.creator_razorpay_connections.token_expires_at <= now()
    )
  returning creator_id into saved_creator_id;

  if saved_creator_id is null then
    raise exception 'An active Razorpay connection already exists';
  end if;

  insert into public.razorpay_connection_audit (creator_id, action, environment)
  values (requested_creator_id, 'connected', requested_environment);

  return true;
end;
$$;

create or replace function public.claim_razorpay_token_refresh(
  requested_environment text,
  requested_batch_size integer
)
returns table (
  creator_id uuid,
  environment text,
  encrypted_refresh_token text,
  lock_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection_row public.creator_razorpay_connections%rowtype;
  new_lock_token uuid;
begin
  if requested_environment is null
    or requested_batch_size is null
    or requested_environment not in ('test', 'live')
    or requested_batch_size not between 1 and 100 then
    raise exception 'Invalid Razorpay refresh request';
  end if;

  with expired_connections as (
    update public.creator_razorpay_connections connection
    set connection_status = 'reconnect_required',
        last_error_code = 'refresh_token_expired',
        refresh_lock_token = null,
        refresh_lock_expires_at = null
    where connection.environment = requested_environment
      and connection.connection_status = 'connected'
      and connection.refresh_token_expires_at <= now()
    returning connection.creator_id, connection.environment
  )
  insert into public.razorpay_connection_audit (creator_id, action, environment, error_code)
  select expired.creator_id, 'reconnect_required', expired.environment, 'refresh_token_expired'
  from expired_connections expired;

  delete from public.razorpay_oauth_states
  where expires_at < now() - interval '1 day';

  for connection_row in
    select connection.*
    from public.creator_razorpay_connections connection
    where connection.environment = requested_environment
      and connection.connection_status = 'connected'
      and connection.token_expires_at <= now() + interval '14 days'
      and connection.refresh_token_expires_at > now()
      and (
        connection.refresh_lock_expires_at is null
        or connection.refresh_lock_expires_at <= now()
      )
    order by connection.token_expires_at
    limit requested_batch_size
    for update skip locked
  loop
    new_lock_token := gen_random_uuid();
    update public.creator_razorpay_connections connection
    set refresh_lock_token = new_lock_token,
        refresh_lock_expires_at = now() + interval '5 minutes'
    where connection.creator_id = connection_row.creator_id
      and connection.environment = requested_environment;

    return query
      select connection_row.creator_id,
        connection_row.environment,
        connection_row.refresh_token_encrypted,
        new_lock_token;
  end loop;
end;
$$;

drop function public.finish_razorpay_token_refresh(uuid, uuid, text, text, text, timestamptz, timestamptz);
create function public.finish_razorpay_token_refresh(
  requested_creator_id uuid,
  requested_environment text,
  requested_lock_token uuid,
  requested_public_token text,
  requested_access_token_encrypted text,
  requested_refresh_token_encrypted text,
  requested_token_expires_at timestamptz,
  requested_refresh_token_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if requested_environment not in ('test', 'live') then
    raise exception 'Invalid Razorpay refresh environment';
  end if;

  update public.creator_razorpay_connections connection
  set public_token = requested_public_token,
      access_token_encrypted = requested_access_token_encrypted,
      refresh_token_encrypted = requested_refresh_token_encrypted,
      token_expires_at = requested_token_expires_at,
      refresh_token_expires_at = requested_refresh_token_expires_at,
      last_refreshed_at = now(),
      last_error_code = null,
      refresh_lock_token = null,
      refresh_lock_expires_at = null
  where connection.creator_id = requested_creator_id
    and connection.environment = requested_environment
    and connection.connection_status = 'connected'
    and connection.refresh_lock_token = requested_lock_token
    and requested_public_token is not null
    and requested_access_token_encrypted is not null
    and requested_refresh_token_encrypted is not null
    and requested_token_expires_at > now()
    and requested_refresh_token_expires_at > now();

  get diagnostics updated_count = row_count;
  if updated_count = 1 then
    insert into public.razorpay_connection_audit (creator_id, action, environment)
    values (requested_creator_id, 'token_refresh_succeeded', requested_environment);
    return true;
  end if;
  return false;
end;
$$;

drop function public.fail_razorpay_token_refresh(uuid, uuid, text, boolean);
create function public.fail_razorpay_token_refresh(
  requested_creator_id uuid,
  requested_environment text,
  requested_lock_token uuid,
  requested_error_code text,
  requested_reconnect_required boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
  audit_action text;
begin
  if requested_environment not in ('test', 'live') then
    raise exception 'Invalid Razorpay refresh environment';
  end if;

  audit_action := case
    when requested_reconnect_required then 'reconnect_required'
    else 'token_refresh_failed'
  end;
  update public.creator_razorpay_connections connection
  set connection_status = case
        when requested_reconnect_required then 'reconnect_required'
        else connection.connection_status
      end,
      last_error_code = left(coalesce(requested_error_code, 'provider_error'), 80),
      refresh_lock_token = null,
      refresh_lock_expires_at = null
  where connection.creator_id = requested_creator_id
    and connection.environment = requested_environment
    and connection.connection_status = 'connected'
    and connection.refresh_lock_token = requested_lock_token;

  get diagnostics updated_count = row_count;
  if updated_count = 1 then
    insert into public.razorpay_connection_audit (creator_id, action, environment, error_code)
    values (
      requested_creator_id,
      audit_action,
      requested_environment,
      left(coalesce(requested_error_code, 'provider_error'), 80)
    );
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.finish_razorpay_token_refresh(uuid, text, uuid, text, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.fail_razorpay_token_refresh(uuid, text, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.finish_razorpay_token_refresh(uuid, text, uuid, text, text, text, timestamptz, timestamptz)
  to service_role;
grant execute on function public.fail_razorpay_token_refresh(uuid, text, uuid, text, boolean)
  to service_role;

alter table public.razorpay_checkout_orders
  alter column environment set default 'test',
  drop constraint razorpay_checkout_orders_environment_check,
  add constraint razorpay_checkout_orders_environment_check
    check (environment in ('test', 'live')),
  add constraint razorpay_checkout_orders_id_environment_key
    unique (id, environment);

alter table public.razorpay_checkout_events
  alter column environment set default 'test',
  drop constraint razorpay_checkout_events_environment_check,
  add constraint razorpay_checkout_events_environment_check
    check (environment in ('test', 'live'));

alter table public.razorpay_payment_attempts
  add column environment text not null default 'test'
    check (environment in ('test', 'live')),
  drop constraint razorpay_payment_attempts_order_id_fkey,
  add constraint razorpay_payment_attempts_order_environment_fkey
    foreign key (order_id, environment)
    references public.razorpay_checkout_orders (id, environment)
    on delete cascade;

drop function public.create_razorpay_checkout_order(uuid, text, text, text, text, text);
create function public.create_razorpay_checkout_order(
  p_product_id uuid,
  p_storefront_username text,
  p_customer_email text,
  p_customer_name text,
  p_customer_phone text,
  p_checkout_token_hash text,
  p_environment text
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
  if p_environment not in ('test', 'live')
     or p_checkout_token_hash !~ '^[0-9a-f]{64}$'
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
    if v_order.environment <> p_environment then
      raise exception 'checkout_environment_mismatch' using errcode = '22023';
    end if;
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
    if not exists (
      select 1
      from public.creator_razorpay_connections connection
      where connection.creator_id = v_order.creator_id
        and connection.environment = p_environment
        and connection.connection_status = 'connected'
        and connection.token_expires_at > now()
        and connection.public_token is not null
        and connection.access_token_encrypted is not null
    ) then
      raise exception 'razorpay_connection_unavailable' using errcode = 'P0002';
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

  if not exists (
    select 1
    from public.creator_razorpay_connections connection
    where connection.creator_id = v_product.user_id
      and connection.environment = p_environment
      and connection.connection_status = 'connected'
      and connection.token_expires_at > now()
      and connection.public_token is not null
      and connection.access_token_encrypted is not null
  ) then
    raise exception 'razorpay_connection_unavailable' using errcode = 'P0002';
  end if;

  insert into public.razorpay_checkout_orders (
    creator_id, storefront_id, product_id, storefront_username,
    customer_email, customer_name, customer_phone, amount_paise,
    checkout_token_hash, environment
  )
  values (
    v_product.user_id, v_product.storefront_id, v_product.id,
    v_store.username, lower(trim(p_customer_email)),
    nullif(trim(p_customer_name), ''), nullif(trim(p_customer_phone), ''),
    v_product.price_paise, p_checkout_token_hash, p_environment
  )
  returning * into v_order;

  return query
    select v_order.id, v_order.creator_id, v_order.storefront_id,
           v_store.store_name, v_store.username, v_product.id,
           v_product.name, v_product.description, v_order.amount_paise,
           v_order.currency, v_order.razorpay_order_id, true;
end;
$$;

revoke all on function public.create_razorpay_checkout_order(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_razorpay_checkout_order(uuid, text, text, text, text, text, text)
  to service_role;

drop function public.claim_razorpay_partner_webhook_events(text, integer);
create function public.claim_razorpay_partner_webhook_events(
  p_event_id text default null,
  p_batch_size integer default 1,
  p_environment text default 'test'
)
returns table (
  event_id text,
  creator_id uuid,
  razorpay_account_id text,
  environment text,
  razorpay_order_id text,
  razorpay_payment_id text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_environment not in ('test', 'live') then
    raise exception 'unsupported_razorpay_environment' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select e.id
      from public.razorpay_checkout_events e
     where e.event_type = 'payment.captured'
       and e.environment = p_environment
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
               e.environment, e.razorpay_order_id, e.razorpay_payment_id
  )
  select c.event_id, c.creator_id, c.razorpay_account_id,
         c.environment, c.razorpay_order_id, c.razorpay_payment_id
    from claimed c;
end;
$$;

revoke all on function public.claim_razorpay_partner_webhook_events(text, integer, text)
  from public, anon, authenticated;
grant execute on function public.claim_razorpay_partner_webhook_events(text, integer, text)
  to service_role;

drop function public.finish_razorpay_partner_webhook_event(text, text, text);
create function public.finish_razorpay_partner_webhook_event(
  p_event_id text,
  p_environment text,
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
  if p_environment not in ('test', 'live')
     or p_processing_status not in ('processed', 'ignored', 'failed') then
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
     and e.environment = p_environment
     and e.processing_status = 'processing';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.finish_razorpay_partner_webhook_event(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finish_razorpay_partner_webhook_event(text, text, text, text)
  to service_role;

drop function public.record_razorpay_checkout_payment(uuid, text, integer, text, text, boolean, integer, integer);
create function public.record_razorpay_checkout_payment(
  p_order_id uuid,
  p_environment text,
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
  v_attempt_order_id uuid;
  v_fulfillment text := 'pending';
begin
  if p_environment not in ('test', 'live') then
    raise exception 'unsupported_razorpay_environment' using errcode = '22023';
  end if;

  select *
    into v_order
    from public.razorpay_checkout_orders o
   where o.id = p_order_id
     and o.environment = p_environment
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
    order_id, environment, razorpay_payment_id, payment_status,
    amount_paise, currency
  )
  values (
    p_order_id, p_environment, p_payment_id, p_payment_status,
    p_amount_paise, p_currency
  )
  on conflict (razorpay_payment_id) do update
    set payment_status = case
      when public.razorpay_payment_attempts.payment_status = 'captured'
        then 'captured'
      else excluded.payment_status
    end,
    verified_at = now()
    where public.razorpay_payment_attempts.order_id = excluded.order_id
      and public.razorpay_payment_attempts.environment = excluded.environment
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
       and o.environment = p_environment
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
     where o.id = p_order_id
       and o.environment = p_environment;
  elsif p_payment_status = 'failed' then
    update public.razorpay_checkout_orders o
       set payment_status = case
         when o.payment_status = 'captured' then 'captured'
         else 'failed'
       end,
       updated_at = now()
     where o.id = p_order_id
       and o.environment = p_environment;
  else
    update public.razorpay_checkout_orders o
       set payment_status = case
         when o.payment_status = 'captured' then 'captured'
         else 'authorized'
       end,
       updated_at = now()
     where o.id = p_order_id
       and o.environment = p_environment;
  end if;

  return query
    select o.order_status, o.fulfillment_status
      from public.razorpay_checkout_orders o
     where o.id = p_order_id
       and o.environment = p_environment;
end;
$$;

revoke all on function public.record_razorpay_checkout_payment(uuid, text, text, integer, text, text, boolean, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_razorpay_checkout_payment(uuid, text, text, integer, text, text, boolean, integer, integer)
  to service_role;
