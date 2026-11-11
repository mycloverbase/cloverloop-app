alter table public.creator_storefronts
  add column first_published_at timestamptz;

update public.creator_storefronts
set first_published_at = published_at
where first_published_at is null
  and published_at is not null;

create or replace function public.preserve_first_storefront_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    new.first_published_at := coalesce(old.first_published_at, now());
  end if;
  return new;
end;
$$;

create trigger preserve_first_storefront_publication
  before update of status on public.creator_storefronts
  for each row execute function public.preserve_first_storefront_publication();

create table public.creator_referrals (
  creator_id uuid primary key references auth.users (id) on delete cascade,
  source text not null check (source = 'founder'),
  attribution_method text not null check (attribution_method in ('signup_link', 'admin_override')),
  attributed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.creator_referral_audit (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('attributed', 'corrected', 'removed')),
  source text check (source is null or source = 'founder'),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.founding_programme_counter (
  id boolean primary key default true check (id),
  next_allocation_number integer not null default 1 check (next_allocation_number between 1 and 51)
);

insert into public.founding_programme_counter (id, next_allocation_number)
values (true, 1)
on conflict (id) do nothing;

create table public.creator_programmes (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null unique references auth.users (id) on delete cascade,
  storefront_id uuid unique references public.creator_storefronts (id) on delete set null,
  referral_source text not null check (referral_source = 'founder'),
  allocation_number integer not null unique check (allocation_number between 1 and 50),
  storefront_published_at timestamptz not null,
  activated_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'expired')),
  fee_waiver_percentage numeric(5,2) not null default 100 check (fee_waiver_percentage = 100),
  reminder_14d_sent_at timestamptz,
  reminder_3d_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at = activated_at + interval '6 months')
);

create index creator_programmes_expiry_idx
  on public.creator_programmes (expires_at)
  where status = 'active';

create table public.creator_subscriptions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('razorpay', 'stripe', 'other')),
  provider_subscription_id text not null unique,
  status text not null check (
    status in ('pending', 'active', 'past_due', 'cancelled', 'expired', 'failed')
  ),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (current_period_start is null and current_period_end is null)
    or (current_period_start is not null and current_period_end > current_period_start)
  )
);

create unique index creator_subscriptions_one_current_idx
  on public.creator_subscriptions (creator_id)
  where status in ('pending', 'active', 'past_due');

create table public.creator_payment_webhook_events (
  provider text not null check (provider in ('razorpay', 'stripe', 'other')),
  event_id text not null,
  event_type text not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  processed_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create table public.creator_plan_changes (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  previous_plan text not null check (previous_plan in ('free', 'creator', 'pro_creator')),
  new_plan text not null check (new_plan in ('free', 'creator', 'pro_creator')),
  change_source text not null check (
    change_source in ('self_upgrade', 'founder_programme', 'admin', 'subscription')
  ),
  programme_id uuid references public.creator_programmes (id) on delete set null,
  subscription_id uuid references public.creator_subscriptions (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.creator_programme_audit (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid references public.creator_programmes (id) on delete set null,
  creator_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (
    action in ('allocated', 'manual_enrolment', 'expired', 'reminder_14d', 'reminder_3d')
  ),
  allocation_number integer,
  reason text,
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create trigger set_creator_referrals_updated_at
  before update on public.creator_referrals
  for each row execute function public.set_creator_storefront_updated_at();

create trigger set_creator_programmes_updated_at
  before update on public.creator_programmes
  for each row execute function public.set_creator_storefront_updated_at();

create trigger set_creator_subscriptions_updated_at
  before update on public.creator_subscriptions
  for each row execute function public.set_creator_storefront_updated_at();

alter table public.creator_referrals enable row level security;
alter table public.creator_referral_audit enable row level security;
alter table public.founding_programme_counter enable row level security;
alter table public.creator_programmes enable row level security;
alter table public.creator_subscriptions enable row level security;
alter table public.creator_payment_webhook_events enable row level security;
alter table public.creator_plan_changes enable row level security;
alter table public.creator_programme_audit enable row level security;

revoke all on public.creator_referrals, public.creator_referral_audit,
  public.founding_programme_counter, public.creator_programmes,
  public.creator_subscriptions, public.creator_payment_webhook_events,
  public.creator_plan_changes, public.creator_programme_audit
from public, anon, authenticated;

create or replace view public.plan_entitlements as
select
  account.id as creator_id,
  case
    when subscription.status = 'active'
      and subscription.current_period_start <= now()
      and subscription.current_period_end > now() then 'pro_creator'
    when coalesce(account.raw_app_meta_data ->> 'plan', 'free') = 'creator' then 'creator'
    else 'free'
  end as plan_key,
  case
    when subscription.status = 'active'
      and subscription.current_period_start <= now()
      and subscription.current_period_end > now() then 299900
    else 0
  end::bigint as monthly_price_paise,
  case
    when subscription.status = 'active'
      and subscription.current_period_start <= now()
      and subscription.current_period_end > now() then 0::numeric
    when programme.id is not null and programme.status = 'active' and programme.expires_at > now()
      then 0::numeric
    when coalesce(account.raw_app_meta_data ->> 'plan', 'free') = 'creator' then 4::numeric
    else 0::numeric
  end as platform_fee_percentage,
  case
    when (
      subscription.status = 'active'
      and subscription.current_period_start <= now()
      and subscription.current_period_end > now()
    ) or coalesce(account.raw_app_meta_data ->> 'plan', 'free') = 'creator' then null::integer
    else 1
  end as paid_product_limit,
  case
    when (
      subscription.status = 'active'
      and subscription.current_period_start <= now()
      and subscription.current_period_end > now()
    ) or coalesce(account.raw_app_meta_data ->> 'plan', 'free') = 'creator' then null::integer
    else 5
  end as free_product_limit,
  null::bigint as monthly_gross_sales_limit_paise,
  programme.allocation_number as founder_allocation_number,
  programme.activated_at as founder_activated_at,
  programme.expires_at as founder_expires_at,
  case
    when programme.id is null then null
    when programme.status = 'active' and programme.expires_at > now() then 'active'
    else 'expired'
  end as founder_status,
  subscription.status as subscription_status,
  subscription.current_period_end as next_billing_at
from auth.users account
left join lateral (
  select current_subscription.*
  from public.creator_subscriptions current_subscription
  where current_subscription.creator_id = account.id
  order by current_subscription.updated_at desc, current_subscription.created_at desc
  limit 1
) subscription on true
left join public.creator_programmes programme on programme.creator_id = account.id;

revoke all on public.plan_entitlements from public, anon, authenticated;
grant select on public.plan_entitlements to service_role;

create or replace function public.is_cloverloop_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false);
$$;

create or replace function public.get_my_plan_entitlements()
returns setof public.plan_entitlements
language sql
stable
security definer
set search_path = ''
as $$
  select entitlements.*
  from public.plan_entitlements entitlements
  where entitlements.creator_id = auth.uid();
$$;

create or replace function public.upgrade_my_creator_plan()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  previous_plan text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtext(current_user_id::text), hashtext('creator-plan'));
  select case when raw_app_meta_data ->> 'plan' = 'creator' then 'creator' else 'free' end
    into previous_plan
  from auth.users
  where id = current_user_id
  for update;

  if not found then
    raise exception 'Creator account not found' using errcode = 'P0002';
  end if;
  if previous_plan = 'creator' then
    return 'already_upgraded';
  end if;

  update auth.users
  set raw_app_meta_data = jsonb_set(
    coalesce(raw_app_meta_data, '{}'::jsonb),
    '{plan}',
    '"creator"'::jsonb,
    true
  )
  where id = current_user_id;

  insert into public.creator_plan_changes (
    creator_id, previous_plan, new_plan, change_source, actor_user_id
  ) values (current_user_id, 'free', 'creator', 'self_upgrade', current_user_id);

  return 'upgraded';
end;
$$;

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
    activated_time + interval '6 months',
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

create or replace function public.on_founder_storefront_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and (
    tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and old.status is distinct from 'published')
  ) then
    perform public.allocate_founding_creator_programme(
      new.user_id,
      new.id,
      null,
      'allocated',
      null
    );
  end if;
  return new;
end;
$$;

create trigger allocate_founder_programme_after_publication
  after insert or update of status on public.creator_storefronts
  for each row execute function public.on_founder_storefront_published();

create or replace function public.record_founding_creator_referral(requested_creator_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if requested_creator_id is null
    or not exists (select 1 from auth.users where id = requested_creator_id) then
    raise exception 'Creator account not found' using errcode = 'P0002';
  end if;

  insert into public.creator_referrals (creator_id, source, attribution_method)
  values (requested_creator_id, 'founder', 'signup_link')
  on conflict (creator_id) do nothing;

  if found then
    insert into public.creator_referral_audit (creator_id, action, source, reason)
    values (requested_creator_id, 'attributed', 'founder', 'Verified founder signup referral');
  end if;
end;
$$;

create or replace function public.admin_override_founder_attribution(
  requested_creator_id uuid,
  requested_source text,
  requested_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_cloverloop_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if requested_source is null or requested_source not in ('founder', 'removed')
    or requested_reason is null
    or char_length(btrim(requested_reason)) not between 5 and 500
    or not exists (select 1 from auth.users where id = requested_creator_id) then
    raise exception 'Invalid referral correction';
  end if;

  if requested_source = 'removed' then
    delete from public.creator_referrals where creator_id = requested_creator_id;
  else
    insert into public.creator_referrals (creator_id, source, attribution_method)
    values (requested_creator_id, 'founder', 'admin_override')
    on conflict (creator_id) do update
      set source = excluded.source,
          attribution_method = 'admin_override',
          updated_at = now();
  end if;

  insert into public.creator_referral_audit (creator_id, action, source, reason, actor_user_id)
  values (
    requested_creator_id,
    case when requested_source = 'removed' then 'removed' else 'corrected' end,
    case when requested_source = 'removed' then null else 'founder' end,
    requested_reason,
    auth.uid()
  );
end;
$$;

create or replace function public.admin_enrol_founding_creator(
  requested_creator_id uuid,
  requested_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator_storefront_id uuid;
begin
  if not public.is_cloverloop_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if requested_reason is null or char_length(btrim(requested_reason)) not between 5 and 500 then
    raise exception 'A reason is required for manual programme enrolment';
  end if;

  select storefront.id into creator_storefront_id
  from public.creator_storefronts storefront
  where storefront.user_id = requested_creator_id
    and storefront.status = 'published'
    and storefront.deleted_at is null;
  if creator_storefront_id is null then
    raise exception 'Creator must have a published storefront';
  end if;

  return public.allocate_founding_creator_programme(
    requested_creator_id,
    creator_storefront_id,
    auth.uid(),
    'manual_enrolment',
    requested_reason
  );
end;
$$;

create or replace function public.expire_founding_creator_programmes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer;
begin
  with expired as (
    update public.creator_programmes programme
    set status = 'expired'
    where programme.status = 'active'
      and programme.expires_at <= now()
    returning programme.id, programme.creator_id, programme.allocation_number
  ), audit_rows as (
    insert into public.creator_programme_audit (
      programme_id, creator_id, action, allocation_number, reason
    )
    select id, creator_id, 'expired', allocation_number, 'Six-month programme term ended'
    from expired
    returning 1
  )
  select count(*) into expired_count from audit_rows;
  return expired_count;
end;
$$;

create or replace function public.claim_founding_programme_reminders()
returns table (
  programme_id uuid,
  creator_id uuid,
  creator_email text,
  creator_name text,
  expires_at timestamptz,
  reminder_days integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select programme.id, programme.creator_id, programme.expires_at,
      case
        when programme.expires_at > now() + interval '3 days'
          and programme.expires_at <= now() + interval '14 days'
          and programme.reminder_14d_sent_at is null then 14
        when programme.expires_at > now()
          and programme.expires_at <= now() + interval '3 days'
          and programme.reminder_3d_sent_at is null then 3
      end as days_before_expiry
    from public.creator_programmes programme
    where programme.status = 'active'
      and programme.expires_at > now()
      and programme.expires_at <= now() + interval '14 days'
    for update skip locked
  ), reserved as (
    update public.creator_programmes programme
    set reminder_14d_sent_at = case
          when due.days_before_expiry = 14 then now()
          else programme.reminder_14d_sent_at
        end,
        reminder_3d_sent_at = case
          when due.days_before_expiry = 3 then now()
          else programme.reminder_3d_sent_at
        end
    from due
    where programme.id = due.id
      and due.days_before_expiry is not null
    returning programme.id, programme.creator_id, programme.expires_at, due.days_before_expiry
  )
  select reserved.id,
    reserved.creator_id,
    account.email::text,
    coalesce(profile.display_name, 'Creator'),
    reserved.expires_at,
    reserved.days_before_expiry
  from reserved
  join auth.users account on account.id = reserved.creator_id
  left join public.creator_profiles profile on profile.user_id = reserved.creator_id;
end;
$$;

create or replace function public.finish_founding_programme_reminder(
  requested_programme_id uuid,
  requested_reminder_days integer,
  requested_sent boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reminder_action text;
  reminder_allocation integer;
  reminder_creator uuid;
begin
  if requested_reminder_days not in (14, 3) or requested_sent is null then
    raise exception 'Invalid programme reminder result';
  end if;

  if requested_sent then
    select creator_id, allocation_number
      into reminder_creator, reminder_allocation
    from public.creator_programmes
    where id = requested_programme_id;
    if not found then
      raise exception 'Founding Creator programme record not found' using errcode = 'P0002';
    end if;
    reminder_action := case when requested_reminder_days = 14 then 'reminder_14d' else 'reminder_3d' end;
    insert into public.creator_programme_audit (
      programme_id, creator_id, action, allocation_number, reason
    ) values (
      requested_programme_id,
      reminder_creator,
      reminder_action,
      reminder_allocation,
      'Expiry reminder accepted by Resend'
    );
  else
    update public.creator_programmes
    set reminder_14d_sent_at = case
          when requested_reminder_days = 14 then null
          else reminder_14d_sent_at
        end,
        reminder_3d_sent_at = case
          when requested_reminder_days = 3 then null
          else reminder_3d_sent_at
        end
    where id = requested_programme_id
      and status = 'active';
  end if;
end;
$$;

create or replace function public.admin_founding_programme_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  report jsonb;
begin
  if not public.is_cloverloop_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'founderRegistrations', (
      select count(*) from public.creator_referrals referral
      where referral.source = 'founder'
    ),
    'publishedReferredCreators', (
      select count(*)
      from public.creator_referrals referral
      join public.creator_storefronts storefront on storefront.user_id = referral.creator_id
      where referral.source = 'founder'
        and storefront.status = 'published'
        and storefront.deleted_at is null
    ),
    'allocated', (
      select next_allocation_number - 1
      from public.founding_programme_counter
      where id = true
    ),
    'remaining', greatest(0, 51 - (
      select next_allocation_number
      from public.founding_programme_counter
      where id = true
    )),
    'creators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'creatorId', account.id,
        'creatorName', coalesce(profile.display_name, 'Creator'),
        'creatorEmail', account.email,
        'referralSource', referral.source,
        'attributionMethod', referral.attribution_method,
        'storefrontId', storefront.id,
        'storefrontName', storefront.store_name,
        'storefrontUsername', storefront.username,
        'storefrontPublishedAt', programme.storefront_published_at,
        'allocationNumber', programme.allocation_number,
        'activatedAt', programme.activated_at,
        'expiresAt', programme.expires_at,
        'programmeStatus', case
          when programme.id is null then 'not_qualified'
          when programme.status = 'active' and programme.expires_at > now() then 'active'
          else 'expired'
        end
      ) order by programme.allocation_number nulls last, referral.attributed_at)
      from public.creator_referrals referral
      join auth.users account on account.id = referral.creator_id
      left join public.creator_profiles profile on profile.user_id = account.id
      left join public.creator_storefronts storefront on storefront.user_id = account.id
      left join public.creator_programmes programme on programme.creator_id = account.id
      where referral.source = 'founder'
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', audit.id,
        'creatorId', audit.creator_id,
        'action', audit.action,
        'reason', audit.reason,
        'actorUserId', audit.actor_user_id,
        'createdAt', audit.created_at
      ) order by audit.created_at desc)
      from (
        select id, creator_id, action, reason, actor_user_id, created_at
        from (
          select id, creator_id, action, reason, actor_user_id, created_at
          from public.creator_referral_audit
          union all
          select id, creator_id, action, reason, actor_user_id, created_at
          from public.creator_programme_audit
        ) entries
        order by created_at desc
        limit 100
      ) audit
    ), '[]'::jsonb)
  ) into report;
  return report;
end;
$$;

create or replace function public.upgrade_creator_to_pro()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  raise exception 'Pro Creator subscriptions are not available until a payment provider is configured'
    using errcode = '0A000';
end;
$$;

create or replace function public.save_storefront_product(
  requested_product_id uuid,
  requested_name text,
  requested_description text,
  requested_category text,
  requested_is_free boolean,
  requested_price_paise bigint,
  requested_cover_image_path text,
  requested_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  product public.storefront_products%rowtype;
  uploaded_path text;
  uploaded_name text;
  uploaded_size bigint;
  uploaded_mime text;
  expected_mime text;
  stored_metadata jsonb;
  account_plan text;
  free_usage bigint;
  paid_usage bigint;
  count_as_free boolean;
  count_as_paid boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  select * into product
  from public.storefront_products
  where id = requested_product_id
    and user_id = current_user_id
    and deleted_at is null
  for update;
  if not found then
    raise exception 'Product not found';
  end if;
  if requested_name is null or char_length(btrim(requested_name)) not between 1 and 100
    or requested_description is null or char_length(btrim(requested_description)) not between 1 and 5000
    or requested_category is not null and char_length(btrim(requested_category)) > 50
    or requested_is_free is null
    or requested_is_active is null
    or requested_price_paise is null or requested_price_paise < 0
    or requested_price_paise > 9007199254740991
    or (requested_is_free and requested_price_paise <> 0)
    or (not requested_is_free and requested_price_paise = 0) then
    raise exception 'Invalid product details';
  end if;
  if not exists (
    select 1 from public.creator_storefronts storefront
    where storefront.id = product.storefront_id
      and storefront.user_id = current_user_id
      and storefront.status <> 'deletion_pending'
  ) then
    raise exception 'Storefront not found';
  end if;
  if requested_cover_image_path is not null and not exists (
    select 1 from public.storefront_assets asset
    where asset.path = requested_cover_image_path
      and asset.user_id = current_user_id
      and asset.storefront_id = product.storefront_id
  ) then
    raise exception 'Invalid product cover image';
  end if;

  uploaded_path := product.file_path;
  uploaded_name := product.file_name;
  uploaded_size := product.file_size;
  uploaded_mime := product.file_mime_type;

  if product.pending_file_path is not null
    and product.pending_file_expires_at > now() then
    select metadata into stored_metadata
    from storage.objects
    where bucket_id = 'product-files'
      and name = product.pending_file_path;
    if found then
      uploaded_path := product.pending_file_path;
      uploaded_name := product.pending_file_name;
      uploaded_size := coalesce(
        nullif(stored_metadata ->> 'size', '')::bigint,
        nullif(stored_metadata ->> 'contentLength', '')::bigint
      );
      uploaded_mime := stored_metadata ->> 'mimetype';
      expected_mime := case lower(regexp_replace(uploaded_name, '^.*\.', ''))
        when 'pdf' then 'application/pdf'
        when 'mp3' then 'audio/mpeg'
        when 'doc' then 'application/msword'
        when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        when 'ppt' then 'application/vnd.ms-powerpoint'
        when 'pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        when 'xls' then 'application/vnd.ms-excel'
        when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        when 'epub' then 'application/epub+zip'
        when 'zip' then 'application/zip'
        when 'txt' then 'text/plain'
        when 'rtf' then 'application/rtf'
        when 'mp4' then 'video/mp4'
        when 'wav' then 'audio/wav'
        when 'jpg' then 'image/jpeg'
        when 'jpeg' then 'image/jpeg'
        when 'png' then 'image/png'
        when 'webp' then 'image/webp'
        else null
      end;
      if uploaded_size is null or uploaded_size < 1 or uploaded_size > 104857600
        or uploaded_mime is distinct from expected_mime then
        raise exception 'Invalid product file';
      end if;
    end if;
  end if;

  if uploaded_path is null then
    raise exception 'A product file is required';
  end if;
  if requested_is_active and uploaded_path is null then
    raise exception 'A product file is required before activation';
  end if;
  if uploaded_path is distinct from product.file_path and product.retired_file_path is not null then
    raise exception 'Previous product file cleanup is pending';
  end if;

  count_as_free := product.counted_as_free;
  count_as_paid := product.counted_as_paid;
  if requested_is_active
    and ((requested_is_free and not count_as_free) or (not requested_is_free and not count_as_paid)) then
    perform pg_advisory_xact_lock(hashtext(current_user_id::text), hashtext('storefront-product-limits'));
    select entitlements.plan_key into account_plan
    from public.plan_entitlements entitlements
    where entitlements.creator_id = current_user_id;

    if coalesce(account_plan, 'free') not in ('creator', 'pro_creator') then
      if requested_is_free and not count_as_free then
        select count(*) into free_usage
        from public.storefront_products
        where user_id = current_user_id and counted_as_free;
        if free_usage >= 5 then
          raise exception 'Free product listing limit reached';
        end if;
      elsif not requested_is_free and not count_as_paid then
        select count(*) into paid_usage
        from public.storefront_products
        where user_id = current_user_id and counted_as_paid;
        if paid_usage >= 1 then
          raise exception 'Paid product listing limit reached';
        end if;
      end if;
      count_as_free := count_as_free or requested_is_free;
      count_as_paid := count_as_paid or not requested_is_free;
    else
      count_as_free := count_as_free or requested_is_free;
      count_as_paid := count_as_paid or not requested_is_free;
    end if;
  end if;

  update public.storefront_products
  set name = btrim(requested_name),
      description = btrim(requested_description),
      category = nullif(btrim(coalesce(requested_category, '')), ''),
      is_free = requested_is_free,
      price_paise = requested_price_paise,
      cover_image_path = requested_cover_image_path,
      is_active = requested_is_active,
      retired_file_path = case
        when uploaded_path is distinct from product.file_path then product.file_path
        else product.retired_file_path
      end,
      file_path = uploaded_path,
      file_name = uploaded_name,
      file_size = uploaded_size,
      file_mime_type = uploaded_mime,
      pending_file_path = null,
      pending_file_name = null,
      pending_file_expires_at = null,
      first_listed_at = case
        when requested_is_active then coalesce(first_listed_at, now())
        else first_listed_at
      end,
      counted_as_free = count_as_free,
      counted_as_paid = count_as_paid
  where id = requested_product_id;
end;
$$;

revoke all on function public.is_cloverloop_admin() from public, anon, authenticated;
revoke all on function public.allocate_founding_creator_programme(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.on_founder_storefront_published() from public, anon, authenticated;
revoke all on function public.expire_founding_creator_programmes() from public, anon, authenticated;
revoke all on function public.claim_founding_programme_reminders() from public, anon, authenticated;
revoke all on function public.finish_founding_programme_reminder(uuid, integer, boolean)
  from public, anon, authenticated;
revoke all on function public.get_my_plan_entitlements() from public, anon;
revoke all on function public.upgrade_my_creator_plan() from public, anon;
revoke all on function public.record_founding_creator_referral(uuid) from public, anon, authenticated;
revoke all on function public.admin_override_founder_attribution(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_enrol_founding_creator(uuid, text)
  from public, anon, authenticated;
revoke all on function public.admin_founding_programme_report() from public, anon, authenticated;
revoke all on function public.upgrade_creator_to_pro() from public, anon;

grant execute on function public.get_my_plan_entitlements() to authenticated;
grant execute on function public.upgrade_my_creator_plan() to authenticated;
grant execute on function public.record_founding_creator_referral(uuid) to service_role;
grant execute on function public.admin_override_founder_attribution(uuid, text, text) to authenticated;
grant execute on function public.admin_enrol_founding_creator(uuid, text) to authenticated;
grant execute on function public.admin_founding_programme_report() to authenticated;
grant execute on function public.upgrade_creator_to_pro() to authenticated;
grant execute on function public.expire_founding_creator_programmes() to service_role;
grant execute on function public.claim_founding_programme_reminders() to service_role;
grant execute on function public.finish_founding_programme_reminder(uuid, integer, boolean)
  to service_role;
