create table public.razorpay_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  creator_id uuid not null references auth.users (id) on delete cascade,
  client_id text not null,
  environment text not null check (environment in ('test', 'live')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index razorpay_oauth_states_expiry_idx
  on public.razorpay_oauth_states (expires_at);

create table public.creator_razorpay_connections (
  creator_id uuid primary key references auth.users (id) on delete cascade,
  razorpay_account_id text not null,
  client_id text not null,
  environment text not null check (environment in ('test', 'live')),
  granted_scope text not null check (granted_scope = 'read_write'),
  public_token text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  connection_status text not null default 'connected'
    check (connection_status in ('connected', 'reconnect_required', 'revoked', 'disconnected')),
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  last_refreshed_at timestamptz,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80),
  refresh_lock_token uuid,
  refresh_lock_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (connection_status in ('connected', 'reconnect_required')
      and public_token is not null
      and access_token_encrypted is not null
      and refresh_token_encrypted is not null
      and token_expires_at is not null
      and refresh_token_expires_at is not null
      and disconnected_at is null)
    or (connection_status in ('revoked', 'disconnected')
      and public_token is null
      and access_token_encrypted is null
      and refresh_token_encrypted is null
      and token_expires_at is null
      and refresh_token_expires_at is null)
  ),
  check (
    (refresh_lock_token is null and refresh_lock_expires_at is null)
    or (refresh_lock_token is not null and refresh_lock_expires_at is not null)
  )
);

create unique index creator_razorpay_connections_account_active_idx
  on public.creator_razorpay_connections (razorpay_account_id)
  where connection_status in ('connected', 'reconnect_required');

create index creator_razorpay_connections_refresh_idx
  on public.creator_razorpay_connections (environment, token_expires_at)
  where connection_status = 'connected';

create trigger set_creator_razorpay_connections_updated_at
  before update on public.creator_razorpay_connections
  for each row execute function public.set_creator_storefront_updated_at();

create table public.razorpay_connection_audit (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (
    action in (
      'connection_started',
      'connected',
      'disconnected',
      'token_refresh_succeeded',
      'token_refresh_failed',
      'reconnect_required',
      'connection_attempt_failed',
      'connection_revocation_failed',
      'authorization_revoked'
    )
  ),
  environment text check (environment is null or environment in ('test', 'live')),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  created_at timestamptz not null default now()
);

create index razorpay_connection_audit_creator_idx
  on public.razorpay_connection_audit (creator_id, created_at desc);

alter table public.razorpay_oauth_states enable row level security;
alter table public.creator_razorpay_connections enable row level security;
alter table public.razorpay_connection_audit enable row level security;

revoke all on public.razorpay_oauth_states, public.creator_razorpay_connections,
  public.razorpay_connection_audit
from public, anon, authenticated;
grant all on public.razorpay_oauth_states, public.creator_razorpay_connections,
  public.razorpay_connection_audit
to service_role;

create or replace function public.consume_razorpay_oauth_state(
  requested_state_hash text,
  requested_creator_id uuid,
  requested_client_id text,
  requested_environment text
)
returns table (
  creator_id uuid,
  client_id text,
  environment text
)
language sql
security definer
set search_path = ''
as $$
  update public.razorpay_oauth_states state
  set consumed_at = now()
  where state.state_hash = requested_state_hash
    and state.creator_id = requested_creator_id
    and state.client_id = requested_client_id
    and state.environment = requested_environment
    and state.consumed_at is null
    and state.expires_at > now()
  returning state.creator_id, state.client_id, state.environment;
$$;

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
    creator_id,
    razorpay_account_id,
    client_id,
    environment,
    granted_scope,
    public_token,
    access_token_encrypted,
    refresh_token_encrypted,
    token_expires_at,
    refresh_token_expires_at,
    connection_status,
    connected_at,
    disconnected_at,
    last_refreshed_at,
    last_error_code,
    refresh_lock_token,
    refresh_lock_expires_at
  ) values (
    requested_creator_id,
    requested_razorpay_account_id,
    requested_client_id,
    requested_environment,
    'read_write',
    requested_public_token,
    requested_access_token_encrypted,
    requested_refresh_token_encrypted,
    requested_token_expires_at,
    requested_refresh_token_expires_at,
    'connected',
    now(),
    null,
    now(),
    null,
    null,
    null
  )
  on conflict (creator_id) do update
  set razorpay_account_id = excluded.razorpay_account_id,
      client_id = excluded.client_id,
      environment = excluded.environment,
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
    where connection.creator_id = connection_row.creator_id;

    return query
      select connection_row.creator_id,
        connection_row.environment,
        connection_row.refresh_token_encrypted,
        new_lock_token;
  end loop;
end;
$$;

create or replace function public.finish_razorpay_token_refresh(
  requested_creator_id uuid,
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
  updated_environment text;
begin
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
    and connection.connection_status = 'connected'
    and connection.refresh_lock_token = requested_lock_token
    and requested_public_token is not null
    and requested_access_token_encrypted is not null
    and requested_refresh_token_encrypted is not null
    and requested_token_expires_at > now()
    and requested_refresh_token_expires_at > now();

  get diagnostics updated_count = row_count;
  if updated_count = 1 then
    select connection.environment into updated_environment
    from public.creator_razorpay_connections connection
    where connection.creator_id = requested_creator_id;
    insert into public.razorpay_connection_audit (creator_id, action, environment)
    values (requested_creator_id, 'token_refresh_succeeded', updated_environment);
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.fail_razorpay_token_refresh(
  requested_creator_id uuid,
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
  updated_environment text;
  audit_action text;
begin
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
    and connection.connection_status = 'connected'
    and connection.refresh_lock_token = requested_lock_token
  returning connection.environment into updated_environment;

  get diagnostics updated_count = row_count;
  if updated_count = 1 then
    insert into public.razorpay_connection_audit (creator_id, action, environment, error_code)
    values (
      requested_creator_id,
      audit_action,
      updated_environment,
      left(coalesce(requested_error_code, 'provider_error'), 80)
    );
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.consume_razorpay_oauth_state(text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.save_razorpay_connection(uuid, text, text, text, text, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_razorpay_token_refresh(text, integer)
  from public, anon, authenticated;
revoke all on function public.finish_razorpay_token_refresh(uuid, uuid, text, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.fail_razorpay_token_refresh(uuid, uuid, text, boolean)
  from public, anon, authenticated;

grant execute on function public.consume_razorpay_oauth_state(text, uuid, text, text) to service_role;
grant execute on function public.save_razorpay_connection(uuid, text, text, text, text, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.claim_razorpay_token_refresh(text, integer) to service_role;
grant execute on function public.finish_razorpay_token_refresh(uuid, uuid, text, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.fail_razorpay_token_refresh(uuid, uuid, text, boolean) to service_role;
