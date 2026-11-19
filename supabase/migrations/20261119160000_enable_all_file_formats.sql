-- Enable all file formats for product uploads
-- Removes file format restrictions to support .prst and other file types

-- Recreate the storefront_products table with updated constraints
-- that accept any alphanumeric file extension instead of just the predefined list

-- Step 1: Create a temporary table with the new constraints
create table public.storefront_products_new (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references public.creator_storefronts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  product_type text not null default 'digital' check (product_type = 'digital'),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text not null check (char_length(btrim(description)) between 1 and 5000),
  category text check (category is null or char_length(btrim(category)) <= 50),
  subcategory text,
  is_free boolean not null default false,
  price_paise bigint not null default 0
    check (price_paise between 0 and 9007199254740991)
    check ((is_free and price_paise = 0) or (not is_free and price_paise > 0)),
  is_active boolean not null default false,
  cover_image_path text references public.storefront_assets (path) on delete set null,
  file_path text,
  retired_file_path text,
  file_name text,
  file_size bigint,
  file_mime_type text,
  pending_file_path text,
  pending_file_name text,
  pending_file_expires_at timestamptz,
  first_listed_at timestamptz,
  counted_as_free boolean not null default false,
  counted_as_paid boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (file_path is null and file_name is null and file_size is null and file_mime_type is null)
    or (file_path is not null and file_name is not null and file_size is not null and file_mime_type is not null)
  ),
  check (file_size is null or file_size between 1 and 104857600),
  check (
    (pending_file_path is null and pending_file_name is null and pending_file_expires_at is null)
    or (pending_file_path is not null and pending_file_name is not null and pending_file_expires_at is not null)
  ),
  check (
    file_path is null
    or file_path ~ (
      '^' || user_id::text || '/' || id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-zA-Z0-9]+$'
    )
  ),
  check (
    retired_file_path is null
    or retired_file_path ~ (
      '^' || user_id::text || '/' || id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-zA-Z0-9]+$'
    )
  ),
  check (
    pending_file_path is null
    or pending_file_path ~ (
      '^' || user_id::text || '/' || id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-zA-Z0-9]+$'
    )
  ),
  check (not is_active or (file_path is not null and deleted_at is null)),
  check (deleted_at is null or not is_active),
  check (first_listed_at is not null or (not counted_as_free and not counted_as_paid))
);

-- Step 2: Copy all data from old table to new table
insert into public.storefront_products_new
select * from public.storefront_products;

-- Step 3: Drop old table (which will cascade to triggers and policies)
drop table public.storefront_products cascade;

-- Step 4: Rename new table to old name
alter table public.storefront_products_new rename to storefront_products;

-- Step 5: Recreate indexes
create index storefront_products_owner_idx
  on public.storefront_products (user_id, created_at desc)
  where deleted_at is null;
create index storefront_products_public_idx
  on public.storefront_products (storefront_id, created_at desc)
  where is_active and deleted_at is null;
create index storefront_products_free_usage_idx
  on public.storefront_products (user_id)
  where counted_as_free;
create index storefront_products_paid_usage_idx
  on public.storefront_products (user_id)
  where counted_as_paid;

-- Step 6: Recreate trigger
create trigger set_storefront_products_updated_at
  before update on public.storefront_products
  for each row execute function public.set_creator_storefront_updated_at();

-- Step 7: Recreate RLS policies
alter table public.storefront_products enable row level security;
revoke all on public.storefront_products from public, anon, authenticated;
grant select on public.storefront_products to authenticated;
create policy "Creators can read their own storefront products"
  on public.storefront_products for select to authenticated
  using (user_id = (select auth.uid()));

-- Step 8: Recreate the function with updated extension list validation
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

