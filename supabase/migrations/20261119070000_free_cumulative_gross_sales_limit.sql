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
  subscription.current_period_end as next_billing_at,
  case
    when (
      subscription.status = 'active'
      and subscription.current_period_start <= now()
      and subscription.current_period_end > now()
    ) or coalesce(account.raw_app_meta_data ->> 'plan', 'free') = 'creator' then null::bigint
    else 1000000::bigint
  end as cumulative_gross_sales_limit_paise
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

create or replace function public.enforce_free_cumulative_gross_sales_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sales_limit_paise bigint;
  successful_gross_sales_paise numeric;
begin
  if new.environment <> 'live' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(new.creator_id::text),
    pg_catalog.hashtext('free-cumulative-gross-sales')
  );

  select entitlement.cumulative_gross_sales_limit_paise
    into sales_limit_paise
  from public.plan_entitlements entitlement
  where entitlement.creator_id = new.creator_id;

  if not found then
    raise exception 'Creator plan entitlement could not be verified';
  end if;
  if sales_limit_paise is null then
    return new;
  end if;

  select coalesce(sum(order_row.amount_paise::numeric), 0::numeric)
    into successful_gross_sales_paise
  from public.razorpay_checkout_orders order_row
  where order_row.creator_id = new.creator_id
    and order_row.environment = 'live'
    and order_row.order_status = 'paid'
    and order_row.payment_status = 'captured';

  if successful_gross_sales_paise + new.amount_paise > sales_limit_paise then
    raise exception 'free_cumulative_sales_limit_reached' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_free_cumulative_gross_sales_limit()
  from public, anon, authenticated;

drop trigger if exists enforce_free_cumulative_gross_sales_limit_before_insert
  on public.razorpay_checkout_orders;
create trigger enforce_free_cumulative_gross_sales_limit_before_insert
  before insert on public.razorpay_checkout_orders
  for each row execute function public.enforce_free_cumulative_gross_sales_limit();
