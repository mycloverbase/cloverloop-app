create or replace function public.sync_my_creator_photo(
  requested_avatar_path text,
  requested_storefront_image_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  v_storefront_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if requested_avatar_path is not null
    and requested_avatar_path !~ (
      '^' || current_user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
    )
  then
    raise exception 'The profile image path is invalid.' using errcode = '23514';
  end if;

  if requested_storefront_image_path is not null
    and requested_storefront_image_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
  then
    raise exception 'The storefront profile image path is invalid.' using errcode = '23514';
  end if;

  select storefront.id
  into v_storefront_id
  from public.creator_storefronts storefront
  where storefront.user_id = current_user_id
    and storefront.status <> 'deletion_pending'
  for update;

  if v_storefront_id is null and requested_storefront_image_path is not null then
    raise exception 'An active storefront is required for a public profile image.'
      using errcode = '23514';
  end if;

  if v_storefront_id is not null
    and requested_storefront_image_path is not null
    and not exists (
      select 1
      from public.storefront_assets asset
      where asset.path = requested_storefront_image_path
        and asset.storefront_id = v_storefront_id
        and asset.user_id = current_user_id
    )
  then
    raise exception 'The storefront profile image has not finished uploading.'
      using errcode = '23514';
  end if;

  update public.creator_profiles
  set avatar_path = requested_avatar_path
  where user_id = current_user_id;

  if not found then
    raise exception 'The creator profile could not be found.' using errcode = '23503';
  end if;

  if v_storefront_id is not null then
    update public.creator_storefronts
    set profile_image_path = requested_storefront_image_path,
        published_snapshot = case
          when status = 'published' and published_snapshot is not null then
            jsonb_set(
              published_snapshot,
              '{profile_image_path}',
              coalesce(to_jsonb(requested_storefront_image_path), 'null'::jsonb),
              true
            )
          else published_snapshot
        end
    where id = v_storefront_id;

    update public.storefront_assets asset
    set is_referenced = public.storefront_asset_is_referenced(asset.path)
    where asset.storefront_id = v_storefront_id;
  end if;
end;
$$;

create or replace function public.save_my_storefront_with_avatar(
  requested_store_name text,
  requested_username text,
  requested_description text,
  requested_profile_image_path text,
  requested_banner_image_path text,
  requested_theme text,
  requested_customization jsonb,
  requested_avatar_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_storefront_id uuid;
begin
  v_storefront_id := public.save_my_storefront(
    requested_store_name,
    requested_username,
    requested_description,
    requested_profile_image_path,
    requested_banner_image_path,
    requested_theme,
    requested_customization
  );

  perform public.sync_my_creator_photo(
    requested_avatar_path,
    requested_profile_image_path
  );

  return v_storefront_id;
end;
$$;

revoke all on function public.sync_my_creator_photo(text, text) from public, anon;
revoke all on function public.save_my_storefront_with_avatar(text, text, text, text, text, text, jsonb, text) from public, anon;
grant execute on function public.sync_my_creator_photo(text, text) to authenticated;
grant execute on function public.save_my_storefront_with_avatar(text, text, text, text, text, text, jsonb, text) to authenticated;
