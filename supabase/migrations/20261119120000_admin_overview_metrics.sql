create or replace function public.admin_get_overview_metrics()
returns table (
  total_orders text,
  gross_sales_paise text,
  published_storefronts text,
  total_creators text
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
  with time_bounds as (
    select statement_timestamp() as period_end
  ), period as (
    select period_end - interval '28 days' as period_start, period_end
    from time_bounds
  )
  select
    (
      select count(*)::text
      from public.razorpay_checkout_orders order_row
      where order_row.environment = 'live'
        and order_row.order_status = 'paid'
        and order_row.created_at >= period.period_start
        and order_row.created_at < period.period_end
    ),
    (
      select coalesce(sum(order_row.amount_paise::numeric), 0::numeric)::text
      from public.razorpay_checkout_orders order_row
      where order_row.environment = 'live'
        and order_row.order_status = 'paid'
        and order_row.payment_status = 'captured'
        and order_row.paid_at >= period.period_start
        and order_row.paid_at < period.period_end
    ),
    (
      select count(*)::text
      from public.creator_storefronts storefront
      where storefront.first_published_at >= period.period_start
        and storefront.first_published_at < period.period_end
        and storefront.status = 'published'
    ),
    (
      select count(*)::text
      from auth.users account
      where account.created_at >= period.period_start
        and account.created_at < period.period_end
    )
  from period;
end;
$$;

revoke all on function public.admin_get_overview_metrics() from public, anon, authenticated, service_role;
grant execute on function public.admin_get_overview_metrics() to authenticated;
