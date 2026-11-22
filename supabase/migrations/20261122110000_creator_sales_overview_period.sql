drop function if exists public.get_my_sales_overview();

create function public.get_my_sales_overview(p_period text default 'last_28_days')
returns table (
  gross_sales_paise text,
  sale_count text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_period_end timestamptz := statement_timestamp();
  v_period_start timestamptz;
begin
  if p_period is null or p_period not in ('last_28_days', 'lifetime') then
    raise exception 'Invalid sales overview period' using errcode = '22023';
  end if;

  v_period_start := v_period_end - interval '28 days';

  return query
  select
    coalesce(sum(order_row.amount_paise::numeric), 0::numeric)::text,
    count(*)::text
  from public.razorpay_checkout_orders order_row
  where order_row.creator_id = (select auth.uid())
    and order_row.environment = 'live'
    and order_row.order_status = 'paid'
    and order_row.payment_status = 'captured'
    and (
      p_period = 'lifetime'
      or (
        order_row.paid_at >= v_period_start
        and order_row.paid_at < v_period_end
      )
    );
end;
$$;

revoke all on function public.get_my_sales_overview(text) from public, anon, service_role;
grant execute on function public.get_my_sales_overview(text) to authenticated;
