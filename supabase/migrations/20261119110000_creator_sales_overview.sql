create or replace function public.get_my_sales_overview()
returns table (
  gross_sales_paise text,
  sale_count text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(order_row.amount_paise::numeric), 0::numeric)::text,
    count(*)::text
  from public.razorpay_checkout_orders order_row
  where order_row.creator_id = (select auth.uid())
    and order_row.environment = 'live'
    and order_row.order_status = 'paid'
    and order_row.payment_status = 'captured';
$$;

revoke all on function public.get_my_sales_overview() from public, anon;
grant execute on function public.get_my_sales_overview() to authenticated;
