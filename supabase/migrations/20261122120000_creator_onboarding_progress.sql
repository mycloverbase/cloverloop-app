create table if not exists public.creator_onboarding_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  current_step smallint not null default 1 check (current_step between 1 and 7),
  completed_steps smallint[] not null default '{}'::smallint[]
    check (cardinality(completed_steps) <= 7),
  skipped_steps smallint[] not null default '{}'::smallint[]
    check (cardinality(skipped_steps) <= 7),
  version integer not null default 0 check (version >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default statement_timestamp()
);

alter table public.creator_onboarding_progress enable row level security;
grant select on public.creator_onboarding_progress to authenticated;

create policy "Creators can read their own onboarding progress"
  on public.creator_onboarding_progress for select to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.creator_onboarding_progress from anon, authenticated;

create or replace function public.initialize_my_creator_onboarding()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  insert into public.creator_onboarding_progress (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.initialize_my_creator_onboarding() from public, anon, service_role;
grant execute on function public.initialize_my_creator_onboarding() to authenticated;

create or replace function public.save_my_creator_onboarding_progress(
  requested_current_step smallint,
  requested_completed_steps smallint[],
  requested_skipped_steps smallint[],
  requested_version integer,
  requested_started boolean default false,
  requested_completed boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  saved_version integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if requested_completed and not exists (
    select 1
    from public.creator_storefronts storefront
    where storefront.user_id = current_user_id
      and storefront.status = 'published'
      and storefront.deleted_at is null
  ) then
    raise exception 'A published storefront is required to complete onboarding'
      using errcode = '42501';
  end if;

  if requested_current_step not between 1 and 7
    or requested_version is null or requested_version < 0
    or requested_completed_steps is null
    or requested_skipped_steps is null
    or cardinality(requested_completed_steps) > 7
    or cardinality(requested_skipped_steps) > 7
    or exists (
      select 1
      from unnest(requested_completed_steps || requested_skipped_steps) as steps(step_number)
      where step_number is null or step_number not between 1 and 7
    )
    or exists (
      select 1
      from unnest(requested_completed_steps) as completed_steps(step_number)
      join unnest(requested_skipped_steps) as skipped_steps(step_number) using (step_number)
    )
    or (
      select count(*) <> count(distinct step_number)
      from unnest(requested_completed_steps || requested_skipped_steps) as steps(step_number)
    )
  then
    raise exception 'Invalid creator onboarding progress' using errcode = '22023';
  end if;

  update public.creator_onboarding_progress
  set current_step = requested_current_step,
      completed_steps = requested_completed_steps,
      skipped_steps = requested_skipped_steps,
      started_at = case
        when requested_started then coalesce(started_at, statement_timestamp())
        else started_at
      end,
      completed_at = case
        when requested_completed then coalesce(completed_at, statement_timestamp())
        else completed_at
      end,
      version = version + 1,
      updated_at = statement_timestamp()
  where user_id = current_user_id
    and version = requested_version
  returning version into saved_version;

  if saved_version is null then
    raise exception 'Creator onboarding progress changed in another session'
      using errcode = '40001';
  end if;

  return saved_version;
end;
$$;

revoke all on function public.save_my_creator_onboarding_progress(
  smallint, smallint[], smallint[], integer, boolean, boolean
) from public, anon, service_role;
grant execute on function public.save_my_creator_onboarding_progress(
  smallint, smallint[], smallint[], integer, boolean, boolean
) to authenticated;
