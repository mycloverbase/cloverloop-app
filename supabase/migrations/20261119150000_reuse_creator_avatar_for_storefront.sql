alter table public.creator_storefronts
  drop constraint creator_storefront_profile_path_owner,
  add constraint creator_storefront_profile_path_owner check (
    profile_image_path is null
    or profile_image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
    or (
      profile_image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
      and substring(profile_image_path from 1 for 37) = user_id::text || '/'
    )
  );

alter table public.storefront_assets
  drop constraint storefront_assets_path_check,
  add constraint storefront_assets_path_check check (
    path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
    or (
      path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
      and substring(path from 1 for 37) = user_id::text || '/'
    )
  );

create or replace function public.register_creator_avatar_storefront_asset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_image_path is not null
    and new.profile_image_path ~ (
      '^' || new.user_id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
    )
  then
    if not exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'creator-avatars'
        and object.name = new.profile_image_path
    ) then
      raise exception 'The creator profile image has not finished uploading.'
        using errcode = '23514';
    end if;

    insert into public.storefront_assets (path, user_id, storefront_id)
    values (new.profile_image_path, new.user_id, new.id)
    on conflict (path) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.register_creator_avatar_storefront_asset()
  from public, anon, authenticated;

drop trigger if exists register_creator_avatar_storefront_asset
  on public.creator_storefronts;
create trigger register_creator_avatar_storefront_asset
  after insert or update of profile_image_path on public.creator_storefronts
  for each row execute function public.register_creator_avatar_storefront_asset();

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
    and (
      requested_avatar_path !~ (
        '^' || current_user_id::text
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
      )
      or not exists (
        select 1
        from storage.objects object
        where object.bucket_id = 'creator-avatars'
          and object.name = requested_avatar_path
      )
    )
  then
    raise exception 'The profile image path is invalid or has not finished uploading.'
      using errcode = '23514';
  end if;

  if requested_storefront_image_path is not null
    and requested_storefront_image_path is distinct from requested_avatar_path
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
    and requested_storefront_image_path is distinct from requested_avatar_path
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

revoke all on function public.sync_my_creator_photo(text, text) from public, anon;
grant execute on function public.sync_my_creator_photo(text, text) to authenticated;
