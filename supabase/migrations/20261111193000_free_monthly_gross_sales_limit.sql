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
  case
    when (
      subscription.status = 'active'
      and subscription.current_period_start <= now()
      and subscription.current_period_end > now()
    ) or coalesce(account.raw_app_meta_data ->> 'plan', 'free') = 'creator' then null::bigint
    else 1000000::bigint
  end as monthly_gross_sales_limit_paise,
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
