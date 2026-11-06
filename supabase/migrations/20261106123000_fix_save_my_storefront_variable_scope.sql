create or replace function public.save_my_storefront(
  requested_store_name text,
  requested_username text,
  requested_description text,
  requested_profile_image_path text,
  requested_banner_image_path text,
  requested_theme text,
  requested_customization jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  v_storefront_id uuid;
  product jsonb;
  social_link jsonb;
  section_count integer;
  hidden_section_count integer;
  unique_hidden_section_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if char_length(trim(requested_store_name)) not between 1 and 80
    or char_length(trim(requested_description)) > 1200
    or lower(trim(requested_username)) !~ '^[a-z0-9_-]{1,30}$'
    or requested_theme not in ('minimal', 'editorial', 'bold')
    or coalesce(jsonb_typeof(requested_customization), '') <> 'object'
    or requested_customization - array[
      'primaryColor', 'accentColor', 'backgroundColor', 'productLayout',
      'bannerStyle', 'sectionOrder', 'hiddenSections', 'products',
      'socialLinks', 'publicEmail'
    ] <> '{}'::jsonb
    or coalesce(jsonb_typeof(requested_customization->'products'), '') <> 'array'
    or jsonb_array_length(case
      when jsonb_typeof(requested_customization->'products') = 'array'
        then requested_customization->'products'
      else '[]'::jsonb
    end) > 3
    or coalesce(jsonb_typeof(requested_customization->'socialLinks'), '') <> 'array'
    or jsonb_array_length(case
      when jsonb_typeof(requested_customization->'socialLinks') = 'array'
        then requested_customization->'socialLinks'
      else '[]'::jsonb
    end) > 10
    or coalesce(jsonb_typeof(requested_customization->'sectionOrder'), '') <> 'array'
    or coalesce(jsonb_typeof(requested_customization->'hiddenSections'), '') <> 'array'
    or coalesce(jsonb_typeof(requested_customization->'primaryColor'), '') <> 'string'
    or requested_customization->>'primaryColor' !~ '^#[0-9A-Fa-f]{6}$'
    or coalesce(jsonb_typeof(requested_customization->'accentColor'), '') <> 'string'
    or requested_customization->>'accentColor' !~ '^#[0-9A-Fa-f]{6}$'
    or coalesce(jsonb_typeof(requested_customization->'backgroundColor'), '') <> 'string'
    or requested_customization->>'backgroundColor' !~ '^#[0-9A-Fa-f]{6}$'
    or coalesce(requested_customization->>'productLayout', '') not in ('grid', 'list')
    or coalesce(requested_customization->>'bannerStyle', '') not in ('wide', 'compact')
    or coalesce(jsonb_typeof(requested_customization->'publicEmail'), '') <> 'string'
    or char_length(coalesce(requested_customization->>'publicEmail', '')) > 254
    or (
      coalesce(requested_customization->>'publicEmail', '') <> ''
      and requested_customization->>'publicEmail' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  then
    raise exception 'Some storefront details are invalid. Review the form and try again.'
      using errcode = '23514';
  end if;

  select count(distinct section.value)
  into section_count
  from jsonb_array_elements_text(requested_customization->'sectionOrder') section(value)
  where section.value in ('about', 'products', 'social', 'contact');
  if section_count <> 4
    or jsonb_array_length(case
      when jsonb_typeof(requested_customization->'sectionOrder') = 'array'
        then requested_customization->'sectionOrder'
      else '[]'::jsonb
    end) <> 4
  then
    raise exception 'The storefront section layout is invalid.'
      using errcode = '23514';
  end if;
  select count(*), count(distinct section.value)
  into hidden_section_count, unique_hidden_section_count
  from jsonb_array_elements_text(case
    when jsonb_typeof(requested_customization->'hiddenSections') = 'array'
      then requested_customization->'hiddenSections'
    else '[]'::jsonb
  end) section(value)
  where section.value in ('about', 'products', 'social', 'contact');
  if hidden_section_count <> jsonb_array_length(requested_customization->'hiddenSections')
    or hidden_section_count <> unique_hidden_section_count
  then
    raise exception 'The storefront section visibility settings are invalid.'
      using errcode = '23514';
  end if;

  insert into public.creator_storefronts (
    user_id,
    store_name,
    username,
    description,
    profile_image_path,
    banner_image_path,
    theme,
    customization
  )
  values (
    current_user_id,
    trim(requested_store_name),
    lower(trim(requested_username)),
    trim(requested_description),
    requested_profile_image_path,
    requested_banner_image_path,
    requested_theme,
    requested_customization
  )
  on conflict (user_id) do update
    set store_name = excluded.store_name,
        username = excluded.username,
        description = excluded.description,
        profile_image_path = excluded.profile_image_path,
        banner_image_path = excluded.banner_image_path,
        theme = excluded.theme,
        customization = excluded.customization
  where public.creator_storefronts.status <> 'deletion_pending'
  returning id into v_storefront_id;

  if v_storefront_id is null then
    raise exception 'A storefront in its deletion period cannot be changed.'
      using errcode = '23514';
  end if;

  if requested_profile_image_path is not null and not exists (
    select 1
    from public.storefront_assets asset
    where asset.path = requested_profile_image_path
      and asset.storefront_id = v_storefront_id
      and asset.user_id = current_user_id
  ) then
    raise exception 'The profile image has not finished uploading.'
      using errcode = '23514';
  end if;
  if requested_banner_image_path is not null and not exists (
    select 1
    from public.storefront_assets asset
    where asset.path = requested_banner_image_path
      and asset.storefront_id = v_storefront_id
      and asset.user_id = current_user_id
  ) then
    raise exception 'The banner image has not finished uploading.'
      using errcode = '23514';
  end if;

  for product in
    select value from jsonb_array_elements(requested_customization->'products')
  loop
    if jsonb_typeof(product) <> 'object'
      or product - array['id', 'title', 'description', 'category', 'coverImagePath'] <> '{}'::jsonb
      or coalesce(jsonb_typeof(product->'id'), '') <> 'string'
      or char_length(product->>'id') not between 1 and 80
      or coalesce(jsonb_typeof(product->'title'), '') <> 'string'
      or coalesce(length(trim(product->>'title')), 0) not between 1 and 80
      or coalesce(jsonb_typeof(product->'description'), '') <> 'string'
      or coalesce(length(trim(product->>'description')), 0) > 240
      or coalesce(jsonb_typeof(product->'category'), '') <> 'string'
      or coalesce(length(trim(product->>'category')), 0) not between 1 and 50
      or coalesce(jsonb_typeof(product->'coverImagePath'), '') <> 'string'
      or not exists (
        select 1
        from public.storefront_assets asset
        where asset.path = product->>'coverImagePath'
          and asset.storefront_id = v_storefront_id
          and asset.user_id = current_user_id
      )
    then
      raise exception 'Each sample product needs a title, category and uploaded cover image.'
        using errcode = '23514';
    end if;
  end loop;

  for social_link in
    select value from jsonb_array_elements(requested_customization->'socialLinks')
  loop
    if jsonb_typeof(social_link) <> 'object'
      or social_link - array['id', 'platform', 'label', 'url'] <> '{}'::jsonb
      or coalesce(jsonb_typeof(social_link->'id'), '') <> 'string'
      or char_length(social_link->>'id') not between 1 and 80
      or coalesce(jsonb_typeof(social_link->'platform'), '') <> 'string'
      or social_link->>'platform' not in (
        'Instagram', 'YouTube', 'Facebook', 'LinkedIn', 'X', 'TikTok',
        'Pinterest', 'Threads', 'Twitch', 'Other'
      )
      or coalesce(jsonb_typeof(social_link->'label'), '') <> 'string'
      or char_length(trim(coalesce(social_link->>'label', ''))) not between 1 and 40
      or coalesce(jsonb_typeof(social_link->'url'), '') <> 'string'
      or char_length(social_link->>'url') > 2048
      or social_link->>'url' !~* '^https?://[^[:space:]]+$'
      or split_part(regexp_replace(social_link->>'url', '^https?://', '', 'i'), '/', 1) ~ '@'
    then
      raise exception 'Each social link needs a label and valid HTTP or HTTPS URL.'
        using errcode = '23514';
    end if;
  end loop;

  update public.storefront_assets
  set is_referenced = false
  where storefront_assets.storefront_id = v_storefront_id;

  update public.storefront_assets asset
  set is_referenced = true
  from public.creator_storefronts storefront
  where asset.storefront_id = v_storefront_id
    and storefront.id = asset.storefront_id
    and (
      asset.path = requested_profile_image_path
      or asset.path = requested_banner_image_path
      or exists (
        select 1
        from jsonb_array_elements(requested_customization->'products') item(value)
        where item.value->>'coverImagePath' = asset.path
      )
      or asset.path = storefront.published_snapshot->>'profile_image_path'
      or asset.path = storefront.published_snapshot->>'banner_image_path'
      or exists (
        select 1
        from jsonb_array_elements(coalesce(
          storefront.published_snapshot->'customization'->'products',
          '[]'::jsonb
        )) item(value)
        where item.value->>'coverImagePath' = asset.path
      )
    );

  return v_storefront_id;
end;
$$;

revoke all on function public.save_my_storefront(text, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.save_my_storefront(text, text, text, text, text, text, jsonb) to authenticated;
