create table public.storefront_product_subcategories (
  id uuid primary key default gen_random_uuid(),
  category text not null check (char_length(btrim(category)) between 1 and 50),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  normalized_name text not null,
  is_suggested boolean not null default false,
  created_at timestamptz not null default now(),
  constraint storefront_product_subcategories_unique_name unique (category, normalized_name)
);

insert into public.storefront_product_subcategories (category, name, normalized_name, is_suggested)
values
  ('Education & Learning', 'Courses', 'courses', true),
  ('Education & Learning', 'Study Notes', 'study notes', true),
  ('Education & Learning', 'eBooks', 'ebooks', true),
  ('Education & Learning', 'Worksheets', 'worksheets', true),
  ('Education & Learning', 'Tutorials', 'tutorials', true),
  ('Education & Learning', 'Learning Resources', 'learning resources', true),
  ('Music', 'Tabs', 'tabs', true),
  ('Music', 'Backing Tracks', 'backing tracks', true),
  ('Music', 'Presets', 'presets', true),
  ('Music', 'MIDI Files', 'midi files', true),
  ('Music', 'Sheet Music', 'sheet music', true),
  ('Music', 'eBooks', 'ebooks', true),
  ('Music', 'Audio Lessons', 'audio lessons', true),
  ('Business & Finance', 'Business Templates', 'business templates', true),
  ('Business & Finance', 'Financial Models', 'financial models', true),
  ('Business & Finance', 'Spreadsheets', 'spreadsheets', true),
  ('Business & Finance', 'Reports', 'reports', true),
  ('Business & Finance', 'eBooks', 'ebooks', true),
  ('Business & Finance', 'Guides', 'guides', true),
  ('Design & Creativity', 'Templates', 'templates', true),
  ('Design & Creativity', 'Graphics', 'graphics', true),
  ('Design & Creativity', 'Fonts', 'fonts', true),
  ('Design & Creativity', 'Presets', 'presets', true),
  ('Design & Creativity', 'Design Assets', 'design assets', true),
  ('Design & Creativity', 'eBooks', 'ebooks', true),
  ('Marketing', 'Social Media Templates', 'social media templates', true),
  ('Marketing', 'Content Calendars', 'content calendars', true),
  ('Marketing', 'Marketing Guides', 'marketing guides', true),
  ('Marketing', 'Copywriting Templates', 'copywriting templates', true),
  ('Marketing', 'eBooks', 'ebooks', true),
  ('Technology', 'Source Code', 'source code', true),
  ('Technology', 'Software', 'software', true),
  ('Technology', 'Plugins', 'plugins', true),
  ('Technology', 'Developer Tools', 'developer tools', true),
  ('Technology', 'Technical Guides', 'technical guides', true),
  ('Technology', 'eBooks', 'ebooks', true),
  ('Productivity', 'Notion Templates', 'notion templates', true),
  ('Productivity', 'Excel Templates', 'excel templates', true),
  ('Productivity', 'Planners', 'planners', true),
  ('Productivity', 'Checklists', 'checklists', true),
  ('Productivity', 'Productivity Guides', 'productivity guides', true),
  ('Lifestyle', 'Guides', 'guides', true),
  ('Lifestyle', 'Recipes', 'recipes', true),
  ('Lifestyle', 'Travel Resources', 'travel resources', true),
  ('Lifestyle', 'Planners', 'planners', true),
  ('Lifestyle', 'eBooks', 'ebooks', true),
  ('Health & Fitness', 'Workout Plans', 'workout plans', true),
  ('Health & Fitness', 'Meal Plans', 'meal plans', true),
  ('Health & Fitness', 'Fitness Guides', 'fitness guides', true),
  ('Health & Fitness', 'Trackers', 'trackers', true),
  ('Health & Fitness', 'eBooks', 'ebooks', true),
  ('Other', 'Guides', 'guides', true),
  ('Other', 'Templates', 'templates', true),
  ('Other', 'eBooks', 'ebooks', true),
  ('Other', 'Digital Downloads', 'digital downloads', true)
on conflict (category, normalized_name) do update
set is_suggested = true;

alter table public.storefront_products
  add column subcategory text not null default 'Digital Downloads'
  check (char_length(btrim(subcategory)) between 1 and 80);

insert into public.storefront_product_subcategories (category, name, normalized_name)
select distinct product.category, 'Digital Downloads', 'digital downloads'
from public.storefront_products product
where not exists (
  select 1
  from public.storefront_product_subcategories subcategory
  where subcategory.category = product.category
    and subcategory.normalized_name = 'digital downloads'
)
on conflict (category, normalized_name) do nothing;

alter table public.storefront_products
  disable trigger require_creator_agreement_on_product_changes;

update public.storefront_products product
set subcategory = case product.category
  when 'Education & Learning' then 'Learning Resources'
  when 'Music' then 'Audio Lessons'
  when 'Business & Finance' then 'Guides'
  when 'Design & Creativity' then 'Design Assets'
  when 'Marketing' then 'Marketing Guides'
  when 'Technology' then 'Technical Guides'
  when 'Productivity' then 'Planners'
  when 'Lifestyle' then 'Guides'
  when 'Health & Fitness' then 'Fitness Guides'
  else 'Digital Downloads'
end;

alter table public.storefront_products
  enable trigger require_creator_agreement_on_product_changes;

alter table public.storefront_product_subcategories enable row level security;
revoke all on public.storefront_product_subcategories from public, anon, authenticated;
grant select on public.storefront_product_subcategories to anon, authenticated;
create policy "Product subcategory options are readable"
  on public.storefront_product_subcategories for select to anon, authenticated
  using (true);

create or replace function public.create_storefront_product_draft(
  requested_storefront_id uuid,
  requested_name text,
  requested_description text,
  requested_category text,
  requested_subcategory text,
  requested_is_free boolean,
  requested_price_paise bigint,
  requested_cover_image_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_subcategory text;
  created_product_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if requested_category is null or char_length(btrim(requested_category)) not between 1 and 50
    or requested_subcategory is null or char_length(btrim(requested_subcategory)) not between 1 and 80 then
    raise exception 'Invalid product category or subcategory';
  end if;

  insert into public.storefront_product_subcategories (category, name, normalized_name)
  values (
    btrim(requested_category),
    btrim(requested_subcategory),
    lower(regexp_replace(btrim(requested_subcategory), '\s+', ' ', 'g'))
  )
  on conflict (category, normalized_name) do nothing;
  select subcategory.name into resolved_subcategory
  from public.storefront_product_subcategories subcategory
  where subcategory.category = btrim(requested_category)
    and subcategory.normalized_name = lower(regexp_replace(btrim(requested_subcategory), '\s+', ' ', 'g'));

  created_product_id := public.create_storefront_product_draft(
    requested_storefront_id,
    requested_name,
    requested_description,
    requested_category,
    requested_is_free,
    requested_price_paise,
    requested_cover_image_path
  );
  update public.storefront_products
  set subcategory = resolved_subcategory
  where id = created_product_id
    and user_id = auth.uid();
  return created_product_id;
end;
$$;

create or replace function public.save_storefront_product(
  requested_product_id uuid,
  requested_name text,
  requested_description text,
  requested_category text,
  requested_subcategory text,
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
  resolved_subcategory text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if requested_category is null or char_length(btrim(requested_category)) not between 1 and 50
    or requested_subcategory is null or char_length(btrim(requested_subcategory)) not between 1 and 80 then
    raise exception 'Invalid product category or subcategory';
  end if;

  insert into public.storefront_product_subcategories (category, name, normalized_name)
  values (
    btrim(requested_category),
    btrim(requested_subcategory),
    lower(regexp_replace(btrim(requested_subcategory), '\s+', ' ', 'g'))
  )
  on conflict (category, normalized_name) do nothing;
  select subcategory.name into resolved_subcategory
  from public.storefront_product_subcategories subcategory
  where subcategory.category = btrim(requested_category)
    and subcategory.normalized_name = lower(regexp_replace(btrim(requested_subcategory), '\s+', ' ', 'g'));

  perform public.save_storefront_product(
    requested_product_id,
    requested_name,
    requested_description,
    requested_category,
    requested_is_free,
    requested_price_paise,
    requested_cover_image_path,
    requested_is_active
  );
  update public.storefront_products
  set subcategory = resolved_subcategory
  where id = requested_product_id
    and user_id = auth.uid();
end;
$$;

revoke all on function public.create_storefront_product_draft(uuid, text, text, text, text, boolean, bigint, text)
  from public, anon, authenticated;
grant execute on function public.create_storefront_product_draft(uuid, text, text, text, text, boolean, bigint, text)
  to authenticated;
revoke all on function public.save_storefront_product(uuid, text, text, text, text, boolean, bigint, text, boolean)
  from public, anon, authenticated;
grant execute on function public.save_storefront_product(uuid, text, text, text, text, boolean, bigint, text, boolean)
  to authenticated;

create or replace view public.published_storefront_products
with (security_barrier = true)
as
select
  storefront.username,
  product.storefront_id,
  product.id,
  product.name,
  product.description,
  product.category,
  product.product_type,
  product.is_free,
  product.price_paise,
  product.cover_image_path,
  product.file_name,
  product.file_size,
  product.file_mime_type,
  product.subcategory
from public.storefront_products product
join public.creator_storefronts storefront on storefront.id = product.storefront_id
where storefront.status = 'published'
  and storefront.deleted_at is null
  and product.is_active
  and product.deleted_at is null;

revoke all on public.published_storefront_products from public, authenticated;
grant select on public.published_storefront_products to anon, authenticated;
