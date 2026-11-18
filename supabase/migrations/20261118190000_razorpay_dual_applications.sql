alter table public.creator_razorpay_connections
  add column application_key text not null default 'ZERO_FEE'
    check (application_key in ('ZERO_FEE', 'FOUR_PERCENT')),
  add column creator_plan_key text
    check (creator_plan_key is null or creator_plan_key in ('free', 'creator', 'pro_creator', 'founding_creator')),
  add column commission_rate numeric(5,2)
    check (commission_rate is null or commission_rate in (0, 4)),
  add column last_verified_at timestamptz;

update public.creator_razorpay_connections
set commission_rate = 0
where commission_rate is null;

alter table public.razorpay_oauth_states
  add column application_key text not null default 'ZERO_FEE'
    check (application_key in ('ZERO_FEE', 'FOUR_PERCENT')),
  add column plan_key text not null default 'free'
    check (plan_key in ('free', 'creator', 'pro_creator', 'founding_creator')),
  add column commission_percentage numeric(5,2) not null default 0
    check (commission_percentage in (0, 4)),
  add column consent_accepted_at timestamptz,
  add column consent_terms_version text,
  add column business_name text,
  add column registered_email text,
  add column migration_id uuid,
  add column completed_at timestamptz;

alter table public.razorpay_connection_audit
  add column application_key text
    check (application_key is null or application_key in ('ZERO_FEE', 'FOUR_PERCENT'));

alter table public.razorpay_checkout_events
  add column application_key text
    check (application_key is null or application_key in ('ZERO_FEE', 'FOUR_PERCENT'));

alter table public.razorpay_checkout_orders
  add column application_key text
    check (application_key is null or application_key in ('ZERO_FEE', 'FOUR_PERCENT')),
  add column application_id text,
  add column razorpay_account_id text,
  add column creator_plan_key text
    check (creator_plan_key is null or creator_plan_key in ('free', 'creator', 'pro_creator')),
  add column platform_commission_rate numeric(5,2)
    check (platform_commission_rate is null or platform_commission_rate in (0, 4)),
  add column platform_commission_amount_paise integer
    check (platform_commission_amount_paise is null or platform_commission_amount_paise >= 0);

alter table public.razorpay_payment_attempts
  add column application_key text
    check (application_key is null or application_key in ('ZERO_FEE', 'FOUR_PERCENT')),
  add column application_id text,
  add column razorpay_account_id text,
  add column creator_plan_key text
    check (creator_plan_key is null or creator_plan_key in ('free', 'creator', 'pro_creator')),
  add column platform_commission_rate numeric(5,2)
    check (platform_commission_rate is null or platform_commission_rate in (0, 4)),
  add column platform_commission_amount_paise integer
    check (platform_commission_amount_paise is null or platform_commission_amount_paise >= 0),
  add column platform_commission_gst_paise integer
    check (platform_commission_gst_paise is null or platform_commission_gst_paise >= 0),
  add column refund_status text not null default 'none'
    check (refund_status in ('none', 'processed', 'failed')),
  add column refund_amount_paise integer
    check (refund_amount_paise is null or refund_amount_paise >= 0),
  add column captured_at timestamptz,
  add column settlement_status text not null default 'unknown'
    check (settlement_status in ('unknown', 'pending', 'settled', 'reversed'));

create table public.razorpay_connection_history (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null,
  razorpay_account_id text not null,
  application_key text not null check (application_key in ('ZERO_FEE', 'FOUR_PERCENT')),
  application_id text not null,
  environment text not null check (environment in ('test', 'live')),
  connection_status text not null,
  creator_plan_key text,
  commission_rate numeric(5,2),
  public_token text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  connected_at timestamptz not null,
  disconnected_at timestamptz,
  archived_at timestamptz not null default now()
);

create table public.razorpay_application_migrations (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null,
  previous_application text not null check (previous_application in ('ZERO_FEE', 'FOUR_PERCENT')),
  new_application text not null check (new_application in ('ZERO_FEE', 'FOUR_PERCENT')),
  previous_plan text check (previous_plan is null or previous_plan in ('free', 'creator', 'pro_creator', 'founding_creator')),
  new_plan text not null check (new_plan in ('free', 'creator', 'pro_creator', 'founding_creator')),
  migration_initiated_at timestamptz not null default now(),
  migration_completed_at timestamptz,
  migration_status text not null default 'pending'
    check (migration_status in ('pending', 'completed', 'failed', 'remediation_required')),
  failure_reason text,
  check (
    (migration_status = 'completed' and migration_completed_at is not null)
    or (migration_status <> 'completed' and migration_completed_at is null)
  )
);

create index razorpay_application_migrations_creator_idx
  on public.razorpay_application_migrations (creator_id, migration_initiated_at desc);
create index razorpay_application_migrations_pending_idx
  on public.razorpay_application_migrations (migration_initiated_at)
  where migration_status in ('pending', 'remediation_required');

create table public.razorpay_commission_consents (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null,
  razorpay_account_id text not null check (razorpay_account_id ~ '^acc_[A-Za-z0-9]+$'),
  registered_creator_email text not null,
  registered_razorpay_email text not null,
  business_name text not null,
  subscription_plan text not null check (subscription_plan = 'creator'),
  commission_rate numeric(5,2) not null check (commission_rate = 4),
  consent_timestamp timestamptz not null,
  terms_version text not null,
  application_key text not null check (application_key = 'FOUR_PERCENT'),
  application_id text not null,
  consent_metadata jsonb not null default '{}'::jsonb,
  state_hash text not null unique check (state_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create table public.razorpay_commission_authorisation_emails (
  id uuid primary key default gen_random_uuid(),
  consent_id uuid not null unique references public.razorpay_commission_consents (id),
  creator_id uuid not null,
  recipient_email text,
  creator_email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'retry', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  email_message_id text,
  last_error_code text,
  failure_alerted_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.razorpay_connection_history enable row level security;
alter table public.razorpay_application_migrations enable row level security;
alter table public.razorpay_commission_consents enable row level security;
alter table public.razorpay_commission_authorisation_emails enable row level security;

revoke all on public.razorpay_connection_history,
  public.razorpay_application_migrations,
  public.razorpay_commission_consents,
  public.razorpay_commission_authorisation_emails
from public, anon, authenticated;
grant all on public.razorpay_connection_history,
  public.razorpay_application_migrations,
  public.razorpay_commission_consents,
  public.razorpay_commission_authorisation_emails
to service_role;

create or replace function public.prevent_razorpay_consent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Razorpay commission consent records are immutable';
end;
$$;

create trigger prevent_razorpay_commission_consent_mutation
  before update or delete on public.razorpay_commission_consents
  for each row execute function public.prevent_razorpay_consent_mutation();

create or replace function public.archive_razorpay_connection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.application_key is distinct from new.application_key
    or old.razorpay_account_id is distinct from new.razorpay_account_id
    or old.environment is distinct from new.environment then
    insert into public.razorpay_connection_history (
      creator_id, razorpay_account_id, application_key, application_id,
      environment, connection_status, creator_plan_key, commission_rate,
      public_token, access_token_encrypted, refresh_token_encrypted,
      token_expires_at, refresh_token_expires_at, connected_at, disconnected_at
    ) values (
      old.creator_id, old.razorpay_account_id, old.application_key, old.client_id,
      old.environment, old.connection_status, old.creator_plan_key, old.commission_rate,
      old.public_token, old.access_token_encrypted, old.refresh_token_encrypted,
      old.token_expires_at, old.refresh_token_expires_at,
      old.connected_at, old.disconnected_at
    );
  end if;
  return new;
end;
$$;

create trigger archive_razorpay_connection_before_change
  before update on public.creator_razorpay_connections
  for each row execute function public.archive_razorpay_connection();

create or replace function public.consume_razorpay_oauth_state(
  requested_state_hash text,
  requested_creator_id uuid
)
returns table (
  creator_id uuid,
  client_id text,
  environment text,
  application_key text,
  plan_key text,
  commission_percentage numeric,
  consent_accepted_at timestamptz,
  consent_terms_version text,
  business_name text,
  registered_email text,
  migration_id uuid
)
language sql
security definer
set search_path = ''
as $$
  update public.razorpay_oauth_states state
  set consumed_at = now()
  where state.state_hash = requested_state_hash
    and state.creator_id = requested_creator_id
    and state.consumed_at is null
    and state.expires_at > now()
  returning state.creator_id, state.client_id, state.environment,
    state.application_key, state.plan_key, state.commission_percentage,
    state.consent_accepted_at, state.consent_terms_version,
    state.business_name, state.registered_email, state.migration_id;
$$;

create or replace function public.get_razorpay_oauth_state_result(
  requested_state_hash text,
  requested_creator_id uuid
)
returns table (completed boolean)
language sql
security definer
set search_path = ''
as $$
  select state.completed_at is not null
  from public.razorpay_oauth_states state
  where state.state_hash = requested_state_hash
    and state.creator_id = requested_creator_id
    and state.expires_at > now();
$$;

create or replace function public.save_razorpay_connection(
  requested_creator_id uuid,
  requested_razorpay_account_id text,
  requested_client_id text,
  requested_environment text,
  requested_application_key text,
  requested_plan_key text,
  requested_commission_percentage numeric,
  requested_public_token text,
  requested_access_token_encrypted text,
  requested_refresh_token_encrypted text,
  requested_token_expires_at timestamptz,
  requested_refresh_token_expires_at timestamptz,
  requested_migration_id uuid,
  requested_state_hash text,
  requested_partnerships_email text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_row public.razorpay_oauth_states%rowtype;
  entitlement_row public.plan_entitlements%rowtype;
  existing_row public.creator_razorpay_connections%rowtype;
  saved_creator_id uuid;
  consent_id uuid;
begin
  if requested_creator_id is null
    or requested_razorpay_account_id is null
    or requested_razorpay_account_id !~ '^acc_[A-Za-z0-9]+$'
    or requested_client_id is null
    or requested_environment is null
    or requested_environment not in ('test', 'live')
    or requested_application_key is null
    or requested_application_key not in ('ZERO_FEE', 'FOUR_PERCENT')
    or requested_plan_key is null
    or requested_plan_key not in ('free', 'creator', 'pro_creator', 'founding_creator')
    or requested_commission_percentage is null
    or requested_commission_percentage not in (0, 4)
    or requested_public_token is null
    or requested_access_token_encrypted is null
    or requested_refresh_token_encrypted is null
    or requested_token_expires_at is null
    or requested_token_expires_at <= now()
    or requested_refresh_token_expires_at is null
    or requested_refresh_token_expires_at <= now()
    or requested_state_hash is null then
    raise exception 'Invalid Razorpay connection details';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(requested_creator_id::text),
    hashtext('razorpay-connection')
  );

  select state.* into state_row
  from public.razorpay_oauth_states state
  where state.state_hash = requested_state_hash
    and state.creator_id = requested_creator_id
    and state.consumed_at is not null
    and state.completed_at is null
  for update;
  if not found
    or state_row.client_id <> requested_client_id
    or state_row.environment <> requested_environment
    or state_row.application_key <> requested_application_key
    or state_row.plan_key <> requested_plan_key
    or state_row.commission_percentage <> requested_commission_percentage
    or state_row.migration_id is distinct from requested_migration_id then
    raise exception 'Razorpay OAuth state does not match the connection';
  end if;

  select entitlement.* into entitlement_row
  from public.plan_entitlements entitlement
  where entitlement.creator_id = requested_creator_id;
  if not found
    or entitlement_row.plan_key <> requested_plan_key
    or entitlement_row.platform_fee_percentage <> requested_commission_percentage
    or (requested_application_key = 'FOUR_PERCENT' and (
      requested_plan_key <> 'creator' or requested_commission_percentage <> 4
    ))
    or (requested_application_key = 'ZERO_FEE' and requested_commission_percentage <> 0) then
    raise exception 'Razorpay OAuth plan changed before connection completed';
  end if;

  select connection.* into existing_row
  from public.creator_razorpay_connections connection
  where connection.creator_id = requested_creator_id
    and connection.environment = requested_environment
  for update;
  if found and existing_row.connection_status in ('connected', 'reconnect_required')
    and existing_row.application_key <> requested_application_key
    and (
      requested_migration_id is null
      or not exists (
        select 1 from public.razorpay_application_migrations migration
        where migration.id = requested_migration_id
          and migration.creator_id = requested_creator_id
          and migration.previous_application = existing_row.application_key
          and migration.new_application = requested_application_key
          and migration.migration_status = 'pending'
      )
    ) then
    raise exception 'Razorpay application migration is not pending';
  end if;

  insert into public.creator_razorpay_connections (
    creator_id, razorpay_account_id, client_id, environment, application_key,
    creator_plan_key, commission_rate, granted_scope, public_token,
    access_token_encrypted, refresh_token_encrypted, token_expires_at,
    refresh_token_expires_at, connection_status, connected_at, disconnected_at,
    last_refreshed_at, last_verified_at, last_error_code,
    refresh_lock_token, refresh_lock_expires_at
  ) values (
    requested_creator_id, requested_razorpay_account_id, requested_client_id,
    requested_environment, requested_application_key, requested_plan_key,
    requested_commission_percentage, 'read_write', requested_public_token,
    requested_access_token_encrypted, requested_refresh_token_encrypted,
    requested_token_expires_at, requested_refresh_token_expires_at,
    'connected', now(), null, now(), now(), null, null, null
  )
  on conflict (creator_id, environment) do update
  set razorpay_account_id = excluded.razorpay_account_id,
      client_id = excluded.client_id,
      application_key = excluded.application_key,
      creator_plan_key = excluded.creator_plan_key,
      commission_rate = excluded.commission_rate,
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
      last_verified_at = now(),
      last_error_code = null,
      refresh_lock_token = null,
      refresh_lock_expires_at = null
  where public.creator_razorpay_connections.connection_status in (
      'disconnected', 'revoked', 'reconnect_required'
    )
    or (
      public.creator_razorpay_connections.connection_status = 'connected'
      and (
        public.creator_razorpay_connections.token_expires_at <= now()
        or public.creator_razorpay_connections.application_key = excluded.application_key
        or requested_migration_id is not null
      )
    )
  returning creator_id into saved_creator_id;

  if saved_creator_id is null then
    raise exception 'An active Razorpay connection already exists';
  end if;

  if requested_migration_id is not null then
    update public.razorpay_application_migrations
    set migration_status = 'completed',
        migration_completed_at = now(),
        failure_reason = null
    where id = requested_migration_id
      and creator_id = requested_creator_id
      and new_application = requested_application_key
      and migration_status = 'pending';
    if not found then
      raise exception 'Razorpay application migration could not be completed';
    end if;
  end if;

  if requested_application_key = 'FOUR_PERCENT' then
    if state_row.consent_accepted_at is null
      or state_row.consent_terms_version is null
      or state_row.business_name is null
      or char_length(btrim(state_row.business_name)) < 2
      or state_row.registered_email is null
      or requested_plan_key <> 'creator'
      or requested_commission_percentage <> 4 then
      raise exception 'Creator commission consent is missing';
    end if;

    insert into public.razorpay_commission_consents (
      creator_id, razorpay_account_id, registered_creator_email,
      registered_razorpay_email, business_name, subscription_plan,
      commission_rate, consent_timestamp, terms_version, application_key,
      application_id, consent_metadata, state_hash
    ) values (
      requested_creator_id, requested_razorpay_account_id,
      (select account.email::text from auth.users account where account.id = requested_creator_id),
      state_row.registered_email, state_row.business_name, requested_plan_key,
      requested_commission_percentage, state_row.consent_accepted_at,
      state_row.consent_terms_version, requested_application_key,
      requested_client_id,
      jsonb_build_object(
        'oauth_environment', requested_environment,
        'consent_source', 'authenticated_settings_form',
        'connection_completed_at', now()
      ),
      requested_state_hash
    )
    on conflict (state_hash) do nothing
    returning id into consent_id;

    if consent_id is null then
      select consent.id into consent_id
      from public.razorpay_commission_consents consent
      where consent.state_hash = requested_state_hash;
    end if;

    if consent_id is null then
      raise exception 'Creator commission consent could not be recorded';
    end if;

    insert into public.razorpay_commission_authorisation_emails (
      consent_id, creator_id, recipient_email, creator_email
    )
    values (
      consent_id, requested_creator_id,
      case
        when requested_partnerships_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
          then requested_partnerships_email
        else null
      end,
      state_row.registered_email
    )
    on conflict (consent_id) do nothing;
  end if;

  update public.razorpay_oauth_states
  set completed_at = now()
  where state_hash = requested_state_hash
    and creator_id = requested_creator_id
    and completed_at is null;

  insert into public.razorpay_connection_audit (
    creator_id, action, environment, application_key
  ) values (requested_creator_id, 'connected', requested_environment, requested_application_key);

  return true;
end;
$$;

create or replace function public.track_razorpay_application_mismatch(
  requested_creator_id uuid,
  requested_previous_plan text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_plan text;
  current_fee numeric;
  current_application text;
  desired_application text;
  environment_value text;
begin
  select entitlement.plan_key, entitlement.platform_fee_percentage
    into current_plan, current_fee
  from public.plan_entitlements entitlement
  where entitlement.creator_id = requested_creator_id;

  if not found then return; end if;
  desired_application := case
    when current_plan = 'creator' and current_fee = 4 then 'FOUR_PERCENT'
    when current_fee = 0 then 'ZERO_FEE'
    else null
  end;
  if desired_application is null then return; end if;

  for environment_value, current_application in
    select connection.environment, connection.application_key
    from public.creator_razorpay_connections connection
    where connection.creator_id = requested_creator_id
      and connection.connection_status in ('connected', 'reconnect_required')
  loop
    if current_application <> desired_application and not exists (
      select 1
      from public.razorpay_application_migrations migration
      where migration.creator_id = requested_creator_id
        and migration.migration_status in ('pending', 'remediation_required')
        and migration.previous_application = current_application
        and migration.new_application = desired_application
    ) then
      insert into public.razorpay_application_migrations (
        creator_id, previous_application, new_application,
        previous_plan, new_plan, migration_status, failure_reason
      ) values (
        requested_creator_id, current_application, desired_application,
        requested_previous_plan, current_plan, 'pending', null
      );
    end if;
  end loop;
end;
$$;

create or replace function public.track_razorpay_plan_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.track_razorpay_application_mismatch(new.creator_id, new.previous_plan);
  return new;
end;
$$;

create trigger track_razorpay_creator_plan_change
  after insert on public.creator_plan_changes
  for each row execute function public.track_razorpay_plan_change();

create or replace function public.track_razorpay_subscription_plan_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_plan text;
begin
  if tg_op = 'UPDATE'
    and old.status is not distinct from new.status
    and old.current_period_start is not distinct from new.current_period_start
    and old.current_period_end is not distinct from new.current_period_end then
    return new;
  end if;

  select connection.creator_plan_key into prior_plan
  from public.creator_razorpay_connections connection
  where connection.creator_id = new.creator_id
  order by connection.connected_at desc
  limit 1;
  perform public.track_razorpay_application_mismatch(
    new.creator_id,
    coalesce(prior_plan, 'free')
  );
  return new;
end;
$$;

create trigger track_razorpay_subscription_plan_change
  after insert or update of status, current_period_start, current_period_end
  on public.creator_subscriptions
  for each row execute function public.track_razorpay_subscription_plan_change();

create or replace function public.track_razorpay_founder_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status = 'expired' then
    perform public.track_razorpay_application_mismatch(new.creator_id, 'creator');
  end if;
  return new;
end;
$$;

create trigger track_razorpay_founder_programme_expiry
  after update of status on public.creator_programmes
  for each row execute function public.track_razorpay_founder_expiry();

create or replace function public.snapshot_razorpay_order_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entitlement_row public.plan_entitlements%rowtype;
  connection_row public.creator_razorpay_connections%rowtype;
begin
  select entitlement.* into entitlement_row
  from public.plan_entitlements entitlement
  where entitlement.creator_id = new.creator_id;
  if not found then
    raise exception 'Creator plan entitlement could not be verified';
  end if;

  select connection.* into connection_row
  from public.creator_razorpay_connections connection
  where connection.creator_id = new.creator_id
    and connection.environment = new.environment
    and connection.connection_status = 'connected'
    and connection.token_expires_at > now();
  if not found
    or connection_row.application_key not in ('ZERO_FEE', 'FOUR_PERCENT')
    or (connection_row.application_key = 'ZERO_FEE' and entitlement_row.platform_fee_percentage <> 0)
    or (connection_row.application_key = 'FOUR_PERCENT' and (
      entitlement_row.plan_key <> 'creator' or entitlement_row.platform_fee_percentage <> 4
    )) then
    raise exception 'Razorpay application does not match the current creator commission entitlement';
  end if;

  new.application_key := connection_row.application_key;
  new.application_id := connection_row.client_id;
  new.razorpay_account_id := connection_row.razorpay_account_id;
  new.creator_plan_key := entitlement_row.plan_key;
  new.platform_commission_rate := entitlement_row.platform_fee_percentage;
  new.platform_commission_amount_paise := round(
    new.amount_paise * entitlement_row.platform_fee_percentage / 100
  )::integer;
  return new;
end;
$$;

create trigger snapshot_razorpay_order_commission_before_insert
  before insert on public.razorpay_checkout_orders
  for each row execute function public.snapshot_razorpay_order_commission();

create or replace function public.snapshot_razorpay_payment_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.razorpay_checkout_orders%rowtype;
begin
  select checkout.* into order_row
  from public.razorpay_checkout_orders checkout
  where checkout.id = new.order_id
    and checkout.environment = new.environment;
  if not found then
    raise exception 'Razorpay checkout order commission snapshot is missing';
  end if;

  new.application_key := order_row.application_key;
  new.application_id := order_row.application_id;
  new.razorpay_account_id := order_row.razorpay_account_id;
  new.creator_plan_key := order_row.creator_plan_key;
  new.platform_commission_rate := order_row.platform_commission_rate;
  new.platform_commission_amount_paise := order_row.platform_commission_amount_paise;
  if new.payment_status = 'captured' then
    new.captured_at := coalesce(new.captured_at, now());
  end if;
  return new;
end;
$$;

create trigger snapshot_razorpay_payment_commission_before_write
  before insert or update on public.razorpay_payment_attempts
  for each row execute function public.snapshot_razorpay_payment_commission();

drop function public.claim_razorpay_partner_webhook_events(text, integer, text);
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
  application_key text,
  razorpay_order_id text,
  razorpay_payment_id text
)
language plpgsql
security definer
set search_path = ''
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
      and e.application_key in ('ZERO_FEE', 'FOUR_PERCENT')
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
  ), claimed as (
    update public.razorpay_checkout_events e
    set processing_status = 'processing',
        attempt_count = e.attempt_count + 1,
        locked_until = now() + interval '60 seconds',
        last_error_code = null
    from candidates c
    where e.id = c.id
    returning e.event_id, e.creator_id, e.razorpay_account_id,
      e.environment, e.application_key, e.razorpay_order_id,
      e.razorpay_payment_id
  )
  select c.event_id, c.creator_id, c.razorpay_account_id,
    c.environment, c.application_key, c.razorpay_order_id,
    c.razorpay_payment_id
  from claimed c;
end;
$$;

create or replace function public.claim_razorpay_token_refresh(
  requested_environment text,
  requested_application_key text,
  requested_batch_size integer
)
returns table (
  creator_id uuid,
  environment text,
  application_key text,
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
  if requested_environment not in ('test', 'live')
    or requested_application_key not in ('ZERO_FEE', 'FOUR_PERCENT')
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
      and connection.application_key = requested_application_key
      and connection.connection_status = 'connected'
      and connection.refresh_token_expires_at <= now()
    returning connection.creator_id, connection.environment, connection.application_key
  )
  insert into public.razorpay_connection_audit (
    creator_id, action, environment, application_key, error_code
  )
  select expired.creator_id, 'reconnect_required', expired.environment,
    expired.application_key, 'refresh_token_expired'
  from expired_connections expired;

  for connection_row in
    select connection.*
    from public.creator_razorpay_connections connection
    where connection.environment = requested_environment
      and connection.application_key = requested_application_key
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
      and connection.environment = connection_row.environment;

    return query
      select connection_row.creator_id,
        connection_row.environment,
        connection_row.application_key,
        connection_row.refresh_token_encrypted,
        new_lock_token;
  end loop;
end;
$$;

create or replace function public.claim_razorpay_commission_authorisation_emails(
  p_batch_size integer default 5
)
returns table (
  email_id uuid,
  consent_id uuid,
  creator_id uuid,
  recipient_email text,
  creator_email text,
  business_name text,
  razorpay_account_id text,
  application_id text,
  plan_status text,
  consent_timestamp timestamptz,
  terms_version text,
  attempt_count integer
)
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select email.id
    from public.razorpay_commission_authorisation_emails email
    where email.attempt_count < 8
      and email.next_attempt_at <= now()
      and (
        email.status in ('pending', 'retry')
        or (email.status = 'sending' and email.locked_until <= now())
      )
    order by email.next_attempt_at, email.created_at
    for update skip locked
    limit least(greatest(coalesce(p_batch_size, 5), 1), 20)
  ), claimed as (
    update public.razorpay_commission_authorisation_emails email
    set status = 'sending',
        attempt_count = email.attempt_count + 1,
        locked_until = now() + interval '3 minutes',
        last_error_code = null
    from candidates
    where email.id = candidates.id
    returning email.id, email.consent_id, email.creator_id, email.recipient_email,
      email.creator_email, email.attempt_count
  )
  select claimed.id, consent.id, claimed.creator_id, claimed.recipient_email,
    claimed.creator_email, consent.business_name, consent.razorpay_account_id,
    consent.application_id, consent.subscription_plan, consent.consent_timestamp,
    consent.terms_version, claimed.attempt_count
  from claimed
  join public.razorpay_commission_consents consent on consent.id = claimed.consent_id;
$$;

create or replace function public.finish_razorpay_commission_authorisation_email(
  p_email_id uuid,
  p_sent boolean,
  p_message_id text default null,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.razorpay_commission_authorisation_emails email
  set status = case
        when p_sent then 'sent'
        when email.attempt_count >= 8 then 'failed'
        else 'retry'
      end,
      sent_at = case when p_sent then now() else null end,
      email_message_id = case when p_sent then left(p_message_id, 200) else null end,
      last_error_code = case when p_sent then null else left(coalesce(p_error_code, 'resend_failed'), 80) end,
      next_attempt_at = case
        when p_sent or email.attempt_count >= 8 then now()
        else now() + make_interval(secs => least(3600, 30 * power(2, email.attempt_count - 1)::integer))
      end,
      locked_until = null
  where email.id = p_email_id
    and email.status = 'sending';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.get_razorpay_oauth_state_result(text, uuid)
  from public, anon, authenticated;
revoke all on function public.consume_razorpay_oauth_state(text, uuid)
  from public, anon, authenticated;
revoke all on function public.save_razorpay_connection(uuid, text, text, text, text, text, numeric, text, text, text, timestamptz, timestamptz, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.track_razorpay_application_mismatch(uuid, text)
  from public, anon, authenticated;
revoke all on function public.claim_razorpay_commission_authorisation_emails(integer)
  from public, anon, authenticated;
revoke all on function public.claim_razorpay_partner_webhook_events(text, integer, text)
  from public, anon, authenticated;
revoke all on function public.claim_razorpay_token_refresh(text, text, integer)
  from public, anon, authenticated;
revoke all on function public.finish_razorpay_commission_authorisation_email(uuid, boolean, text, text)
  from public, anon, authenticated;

grant execute on function public.get_razorpay_oauth_state_result(text, uuid) to service_role;
grant execute on function public.consume_razorpay_oauth_state(text, uuid) to service_role;
grant execute on function public.save_razorpay_connection(uuid, text, text, text, text, text, numeric, text, text, text, timestamptz, timestamptz, uuid, text, text)
  to service_role;
grant execute on function public.track_razorpay_application_mismatch(uuid, text) to service_role;
grant execute on function public.claim_razorpay_commission_authorisation_emails(integer)
  to service_role;
grant execute on function public.claim_razorpay_partner_webhook_events(text, integer, text)
  to service_role;
grant execute on function public.claim_razorpay_token_refresh(text, text, integer)
  to service_role;
grant execute on function public.finish_razorpay_commission_authorisation_email(uuid, boolean, text, text)
  to service_role;
