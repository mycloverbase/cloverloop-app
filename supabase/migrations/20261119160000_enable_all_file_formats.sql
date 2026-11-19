-- Enable all file formats for product uploads
-- Removes file format restrictions to support .prst and other file types

-- Update table check constraints to accept any alphanumeric file extension
alter table public.storefront_products
  drop constraint storefront_products_file_path_check,
  drop constraint storefront_products_retired_file_path_check,
  drop constraint storefront_products_pending_file_path_check;

alter table public.storefront_products
  add constraint storefront_products_file_path_check check (
    file_path is null
    or file_path ~ (
      '^' || user_id::text || '/' || id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-zA-Z0-9]+$'
    )
  ),
  add constraint storefront_products_retired_file_path_check check (
    retired_file_path is null
    or retired_file_path ~ (
      '^' || user_id::text || '/' || id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-zA-Z0-9]+$'
    )
  ),
  add constraint storefront_products_pending_file_path_check check (
    pending_file_path is null
    or pending_file_path ~ (
      '^' || user_id::text || '/' || id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-zA-Z0-9]+$'
    )
  );

-- Update begin_storefront_product_upload function to accept all file extensions
create or replace function public.begin_storefront_product_upload(
  requested_product_id uuid,
  requested_extension text,
  requested_file_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  upload_path text;
  safe_extension text := lower(requested_extension);
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if safe_extension is null
    or requested_file_name is null
    or char_length(btrim(requested_file_name)) not between 1 and 255
    or requested_file_name ~ '[[:cntrl:]]'
    or position('/' in requested_file_name) > 0
    or position(chr(92) in requested_file_name) > 0
    or lower(regexp_replace(requested_file_name, '^.*\.', '')) <> safe_extension then
    raise exception 'Unsupported product file';
  end if;

  upload_path := current_user_id::text || '/' || requested_product_id::text || '/'
    || gen_random_uuid()::text || '.' || safe_extension;
  update public.storefront_products product
  set pending_file_path = upload_path,
      pending_file_name = btrim(requested_file_name),
      pending_file_expires_at = now() + interval '15 minutes'
  where product.id = requested_product_id
    and product.user_id = current_user_id
    and product.deleted_at is null
    and exists (
      select 1 from public.creator_storefronts storefront
      where storefront.id = product.storefront_id
        and storefront.status <> 'deletion_pending'
    )
    and not exists (
      select 1 from storage.objects stored_object
      where stored_object.bucket_id = 'product-files'
        and stored_object.name = product.pending_file_path
    );
  if not found then
    raise exception 'Product not found';
  end if;
  return upload_path;
end;
$$;
