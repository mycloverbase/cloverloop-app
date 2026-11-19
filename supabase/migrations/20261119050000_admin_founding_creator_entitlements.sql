create table if not exists public.creator_founder_entitlement_admin_audit (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null,
  creator_email text not null,
  programme_id uuid not null,
  action text not null check (action in ('added', 'removed')),
  allocation_number integer not null check (allocation_number between 1 and 50),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  actor_user_id uuid not null,
  activated_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists creator_founder_entitlement_admin_audit_recent_idx
  on public.creator_founder_entitlement_admin_audit (created_at desc);

alter table public.creator_founder_entitlement_admin_audit enable row level security;
revoke all on public.creator_founder_entitlement_admin_audit from public, anon, authenticated;
alter table public.creator_programmes
  alter column storefront_published_at drop not null;

create or replace function public.admin_set_founding_creator_entitlement(
  requested_creator_id uuid,
  requested_action text,
  requested_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator_email_value text;
  stored_plan text;
  previous_plan text;
  current_program public.creator_programmes%rowtype;
  program_exists boolean;
  allocation_number_value integer;
  storefront_id_value uuid;
  storefront_published_time timestamptz;
  activated_time timestamptz;
  expires_time timestamptz;
begin
  if not public.is_cloverloop_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if requested_creator_id is null
    or requested_action is null
    or requested_action not in ('add', 'remove')
    or requested_reason is null
    or char_length(btrim(requested_reason)) not between 5 and 500 then
    raise exception 'A valid action and a reason of 5-500 characters are required';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(requested_creator_id::text),
    hashtext('creator-plan')
  );
  select account.email, account.raw_app_meta_data ->> 'plan'
    into creator_email_value, stored_plan
  from auth.users as account
  where account.id = requested_creator_id
  for update;
  if not found then
    return 'not_found';
  end if;

  select programme.*
    into current_program
  from public.creator_programmes as programme
  where programme.creator_id = requested_creator_id
  for update;
  program_exists := found;

  if requested_action = 'remove' then
    if not program_exists
      or current_program.status <> 'active'
      or current_program.expires_at <= clock_timestamp() then
      return 'not_active';
    end if;

    update public.creator_programmes
    set status = 'expired'
    where id = current_program.id;

    insert into public.creator_programme_audit (
      programme_id,
      creator_id,
      action,
      allocation_number,
      reason,
      actor_user_id
    ) values (
      current_program.id,
      requested_creator_id,
      'expired',
      current_program.allocation_number,
      'Admin removed Founding Creator entitlement: ' || btrim(requested_reason),
      auth.uid()
    );

    insert into public.creator_founder_entitlement_admin_audit (
      creator_id,
      creator_email,
      programme_id,
      action,
      allocation_number,
      reason,
      actor_user_id,
      activated_at,
      expires_at
    ) values (
      requested_creator_id,
      creator_email_value,
      current_program.id,
      'removed',
      current_program.allocation_number,
      btrim(requested_reason),
      auth.uid(),
      current_program.activated_at,
      current_program.expires_at
    );
    return 'removed';
  end if;

  if exists (
    select 1
    from public.creator_subscriptions as subscription
    where subscription.creator_id = requested_creator_id
      and subscription.status in ('pending', 'active', 'past_due')
  ) then
    return 'subscription_managed';
  end if;
  if program_exists
    and current_program.status = 'active'
    and current_program.expires_at > clock_timestamp() then
    return 'already_active';
  end if;

  if program_exists then
    allocation_number_value := current_program.allocation_number;
  else
    select counter.next_allocation_number
      into allocation_number_value
    from public.founding_programme_counter as counter
    where counter.id = true
    for update;
    if allocation_number_value is null or allocation_number_value > 50 then
      return 'capacity_reached';
    end if;
    update public.founding_programme_counter
    set next_allocation_number = allocation_number_value + 1
    where id = true;
  end if;

  activated_time := clock_timestamp();
  expires_time := activated_time + interval '3 months';
  select storefront.id,
         coalesce(storefront.first_published_at, storefront.published_at)
    into storefront_id_value, storefront_published_time
  from public.creator_storefronts as storefront
  where storefront.user_id = requested_creator_id
    and storefront.status = 'published'
    and storefront.deleted_at is null
  order by storefront.created_at desc
  limit 1;

  if program_exists then
    update public.creator_programmes
    set storefront_id = storefront_id_value,
        storefront_published_at = storefront_published_time,
        activated_at = activated_time,
        expires_at = expires_time,
        status = 'active'
    where id = current_program.id
    returning * into current_program;
  else
    insert into public.creator_programmes (
      creator_id,
      storefront_id,
      referral_source,
      allocation_number,
      storefront_published_at,
      activated_at,
      expires_at,
      status
    ) values (
      requested_creator_id,
      storefront_id_value,
      'founder',
      allocation_number_value,
      storefront_published_time,
      activated_time,
      expires_time,
      'active'
    )
    returning * into current_program;
  end if;

  previous_plan := case
    when stored_plan = 'creator' then 'creator'
    when stored_plan = 'pro_creator' then 'pro_creator'
    else 'free'
  end;
  update auth.users
  set raw_app_meta_data = jsonb_set(
    coalesce(raw_app_meta_data, '{}'::jsonb),
    '{plan}',
    '"creator"'::jsonb,
    true
  )
  where id = requested_creator_id;

  insert into public.creator_plan_changes (
    creator_id,
    previous_plan,
    new_plan,
    change_source,
    programme_id,
    actor_user_id,
    admin_reason
  ) values (
    requested_creator_id,
    previous_plan,
    'creator',
    'founder_programme',
    current_program.id,
    auth.uid(),
    btrim(requested_reason)
  );

  insert into public.creator_programme_audit (
    programme_id,
    creator_id,
    action,
    allocation_number,
    reason,
    actor_user_id
  ) values (
    current_program.id,
    requested_creator_id,
    'manual_enrolment',
    allocation_number_value,
    btrim(requested_reason),
    auth.uid()
  );

  insert into public.creator_founder_entitlement_admin_audit (
    creator_id,
    creator_email,
    programme_id,
    action,
    allocation_number,
    reason,
    actor_user_id,
    activated_at,
    expires_at
  ) values (
    requested_creator_id,
    creator_email_value,
    current_program.id,
    'added',
    allocation_number_value,
    btrim(requested_reason),
    auth.uid(),
    activated_time,
    expires_time
  );
  return 'added';
end;
$$;

create or replace function public.admin_founding_creator_entitlement_audit()
returns table (
  id uuid,
  creator_email text,
  action text,
  allocation_number integer,
  reason text,
  actor_email text,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_cloverloop_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  select
    audit.id,
    audit.creator_email,
    audit.action,
    audit.allocation_number,
    audit.reason,
    actor.email::text,
    audit.activated_at,
    audit.expires_at,
    audit.created_at
  from public.creator_founder_entitlement_admin_audit as audit
  left join auth.users as actor on actor.id = audit.actor_user_id
  order by audit.created_at desc
  limit 25;
end;
$$;

revoke all on function public.admin_set_founding_creator_entitlement(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_founding_creator_entitlement_audit()
  from public, anon, authenticated;
grant execute on function public.admin_set_founding_creator_entitlement(uuid, text, text)
  to authenticated;
grant execute on function public.admin_founding_creator_entitlement_audit()
  to authenticated;
