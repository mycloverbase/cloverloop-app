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
  saved_consent_id uuid;
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
    returning id into saved_consent_id;

    if saved_consent_id is null then
      select consent.id into saved_consent_id
      from public.razorpay_commission_consents consent
      where consent.state_hash = requested_state_hash;
    end if;

    if saved_consent_id is null then
      raise exception 'Creator commission consent could not be recorded';
    end if;

    insert into public.razorpay_commission_authorisation_emails (
      consent_id, creator_id, recipient_email, creator_email
    )
    values (
      saved_consent_id, requested_creator_id,
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
