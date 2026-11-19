do $$
declare
  expiry_check_name text;
begin
  select constraint_row.conname
    into expiry_check_name
  from pg_catalog.pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.creator_programmes'::regclass
    and constraint_row.contype = 'c'
    and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%expires_at%'
    and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%activated_at%';

  if expiry_check_name is null then
    raise exception 'Founding Creator expiry constraint could not be located';
  end if;

  execute format(
    'alter table public.creator_programmes drop constraint %I',
    expiry_check_name
  );
end;
$$;

alter table public.creator_programmes
  add constraint creator_programmes_expiry_duration_check
  check (
    expires_at = activated_at + interval '3 months'
    or expires_at = activated_at + interval '6 months'
  );

create or replace function public.allocate_founding_creator_programme(
  requested_creator_id uuid,
  requested_storefront_id uuid,
  requested_actor_user_id uuid,
  requested_action text,
  requested_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_slot integer;
  existing_allocation integer;
  programme_id uuid;
  activated_time timestamptz := now();
  storefront_published_time timestamptz;
  previous_plan text;
begin
  if requested_action is null or requested_action not in ('allocated', 'manual_enrolment') then
    raise exception 'Invalid programme allocation action';
  end if;
  if requested_action = 'manual_enrolment'
    and (requested_reason is null or char_length(btrim(requested_reason)) not between 5 and 500) then
    raise exception 'A reason is required for manual programme enrolment';
  end if;

  perform pg_advisory_xact_lock(hashtext('founding-creator-programme'));

  select programme.allocation_number
    into existing_allocation
  from public.creator_programmes programme
  where programme.creator_id = requested_creator_id;
  if found then
    return existing_allocation;
  end if;

  if not exists (
    select 1
    from public.creator_referrals referral
    where referral.creator_id = requested_creator_id
      and referral.source = 'founder'
  ) then
    return null;
  end if;

  select coalesce(storefront.first_published_at, storefront.published_at)
    into storefront_published_time
  from public.creator_storefronts storefront
  where storefront.id = requested_storefront_id
    and storefront.user_id = requested_creator_id
    and storefront.status = 'published'
    and storefront.deleted_at is null;
  if storefront_published_time is null then
    return null;
  end if;

  select next_allocation_number
    into next_slot
  from public.founding_programme_counter
  where id = true
  for update;

  if next_slot is null or next_slot > 50 then
    return null;
  end if;

  update public.founding_programme_counter
  set next_allocation_number = next_slot + 1
  where id = true;

  insert into public.creator_programmes (
    creator_id, storefront_id, referral_source, allocation_number,
    storefront_published_at, activated_at, expires_at, status
  ) values (
    requested_creator_id,
    requested_storefront_id,
    'founder',
    next_slot,
    storefront_published_time,
    activated_time,
    activated_time + interval '3 months',
    'active'
  )
  returning id into programme_id;

  select coalesce(raw_app_meta_data ->> 'plan', 'free')
    into previous_plan
  from auth.users
  where id = requested_creator_id
  for update;

  update auth.users
  set raw_app_meta_data = jsonb_set(
    coalesce(raw_app_meta_data, '{}'::jsonb),
    '{plan}',
    '"creator"'::jsonb,
    true
  )
  where id = requested_creator_id;

  if previous_plan is distinct from 'creator' then
    insert into public.creator_plan_changes (
      creator_id, previous_plan, new_plan, change_source, programme_id, actor_user_id
    ) values (
      requested_creator_id,
      case when previous_plan in ('free', 'pro_creator') then previous_plan else 'free' end,
      'creator',
      'founder_programme',
      programme_id,
      requested_actor_user_id
    );
  end if;

  insert into public.creator_programme_audit (
    programme_id, creator_id, action, allocation_number, reason, actor_user_id
  ) values (
    programme_id, requested_creator_id, requested_action, next_slot,
    nullif(btrim(coalesce(requested_reason, '')), ''), requested_actor_user_id
  );

  return next_slot;
end;
$$;
