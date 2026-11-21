create or replace function public.publish_my_storefront()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if exists (
    select 1
    from public.creator_storefronts storefront
    where storefront.user_id = current_user_id
      and storefront.status <> 'published'
      and storefront.status <> 'deletion_pending'
      and char_length(trim(storefront.store_name)) > 0
      and storefront.profile_image_path is not null
      and exists (
        select 1
        from public.storefront_assets asset
        where asset.path = storefront.profile_image_path
          and asset.storefront_id = storefront.id
          and asset.is_referenced
      )
  ) and not exists (
    select 1
    from public.storefront_products product
    where product.storefront_id = storefront.id
      and product.user_id = current_user_id
      and product.is_active
      and product.deleted_at is null
      and not product.is_free
      and product.price_paise > 0
  ) then
    raise exception 'Choose at least one active paid product before publishing.'
      using errcode = '23514';
  end if;

  update public.creator_storefronts
  set status = 'published',
      published_at = now(),
      unpublished_at = null,
      published_snapshot = jsonb_build_object(
        'store_name', store_name,
        'username', username,
        'description', description,
        'profile_image_path', profile_image_path,
        'banner_image_path', banner_image_path,
        'theme', theme,
        'customization', customization
      )
  where (
      user_id = current_user_id
      and status <> 'published'
      and status <> 'deletion_pending'
      and char_length(trim(store_name)) > 0
      and profile_image_path is not null
      and exists (
        select 1 from public.storefront_assets asset
        where asset.path = profile_image_path
          and asset.storefront_id = creator_storefronts.id
          and asset.is_referenced
      )
      and exists (
        select 1
        from public.storefront_products product
        where product.storefront_id = creator_storefronts.id
          and product.user_id = current_user_id
          and product.is_active
          and product.deleted_at is null
          and not product.is_free
          and product.price_paise > 0
      )
    )
    or (
      user_id = current_user_id
      and status = 'published'
      and char_length(trim(store_name)) > 0
      and profile_image_path is not null
      and exists (
        select 1 from public.storefront_assets asset
        where asset.path = profile_image_path
          and asset.storefront_id = creator_storefronts.id
          and asset.is_referenced
      )
    );
  if not found then
    raise exception 'Add a store name and profile image before publishing.'
      using errcode = '23514';
  end if;

  update public.storefront_assets asset
  set is_referenced = coalesce((
    asset.path = storefront.profile_image_path
    or asset.path = storefront.banner_image_path
    or exists (
      select 1
      from jsonb_array_elements(storefront.customization->'products') item(value)
      where item.value->>'coverImagePath' = asset.path
    )
  ), false)
  from public.creator_storefronts storefront
  where storefront.user_id = current_user_id
    and asset.storefront_id = storefront.id;
end;
$$;
