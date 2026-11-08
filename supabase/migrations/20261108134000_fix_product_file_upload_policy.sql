create or replace function public.can_upload_storefront_product_file(requested_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.storefront_products product
    where product.user_id = (select auth.uid())
      and product.deleted_at is null
      and product.pending_file_path = requested_path
      and product.pending_file_expires_at > now()
  );
$$;

revoke all on function public.can_upload_storefront_product_file(text) from public, anon, authenticated;
grant execute on function public.can_upload_storefront_product_file(text) to authenticated;

drop policy if exists "Creators can upload files to their product upload slot" on storage.objects;
create policy "Creators can upload files to their product upload slot"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-files'
    and public.can_upload_storefront_product_file(name)
  );
