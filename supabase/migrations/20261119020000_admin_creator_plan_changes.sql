alter table public.creator_plan_changes
  add column admin_reason text
    check (
      admin_reason is null
      or char_length(btrim(admin_reason)) between 5 and 500
    );

create or replace function public.admin_change_creator_plan(
  requested_creator_id uuid,
  requested_plan text,
  requested_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_metadata jsonb;
  stored_plan text;
  previous_plan text;
begin
  if not public.is_cloverloop_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if requested_creator_id is null
    or requested_plan is null
    or requested_plan not in ('free', 'creator')
    or requested_reason is null
    or char_length(btrim(requested_reason)) not between 5 and 500 then
    raise exception 'A valid plan and a reason of 5-500 characters are required';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(requested_creator_id::text),
    hashtext('creator-plan')
  );
  select account.raw_app_meta_data
    into account_metadata
  from auth.users as account
  where account.id = requested_creator_id
  for update;

  if not found then
    raise exception 'Creator account not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.creator_subscriptions as subscription
    where subscription.creator_id = requested_creator_id
      and subscription.status in ('pending', 'active', 'past_due')
  ) then
    raise exception 'Paid subscription plans must be changed through the payment provider'
      using errcode = '0A000';
  end if;

  stored_plan := coalesce(account_metadata ->> 'plan', 'free');
  previous_plan := case when stored_plan = 'creator' then 'creator' else 'free' end;
  if stored_plan = requested_plan then
    return 'unchanged';
  end if;

  update auth.users
  set raw_app_meta_data = jsonb_set(
    coalesce(raw_app_meta_data, '{}'::jsonb),
    '{plan}',
    to_jsonb(requested_plan),
    true
  )
  where id = requested_creator_id;

  insert into public.creator_plan_changes (
    creator_id,
    previous_plan,
    new_plan,
    change_source,
    actor_user_id,
    admin_reason
  ) values (
    requested_creator_id,
    previous_plan,
    requested_plan,
    'admin',
    auth.uid(),
    btrim(requested_reason)
  );

  return 'updated';
end;
$$;

revoke all on function public.admin_change_creator_plan(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_change_creator_plan(uuid, text, text)
  to authenticated;
