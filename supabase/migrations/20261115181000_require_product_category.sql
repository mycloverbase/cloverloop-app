update public.storefront_products
set category = 'Other'
where category is null or char_length(btrim(category)) = 0;

alter table public.storefront_products
  drop constraint if exists storefront_products_category_check;

alter table public.storefront_products
  alter column category set not null;

alter table public.storefront_products
  add constraint storefront_products_category_required
  check (char_length(btrim(category)) between 1 and 50);
