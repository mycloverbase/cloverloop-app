update storage.buckets
set public = true
where id = 'storefront-assets';

create or replace function public.register_storefront_asset(
  requested_storefront_id uuid,
  requested_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.creator_storefronts
    where id = requested_storefront_id
      and user_id = current_user_id
      and status <> 'deletion_pending'
  ) or (
    requested_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
    and requested_path !~ (
      '^' || current_user_id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
    )
  ) then
    raise exception 'The uploaded image could not be associated with this storefront.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'storefront-assets'
      and name = requested_path
  ) then
    raise exception 'The uploaded image has not finished uploading.'
      using errcode = '23514';
  end if;

  insert into public.storefront_assets (path, user_id, storefront_id)
  values (requested_path, current_user_id, requested_storefront_id);
end;
$$;

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

    if not exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'storefront-assets'
        and object.name = new.profile_image_path
    ) then
      raise exception 'The public storefront copy of the creator profile image is missing.'
        using errcode = '23514';
    end if;

    insert into public.storefront_assets (path, user_id, storefront_id)
    values (new.profile_image_path, new.user_id, new.id)
    on conflict (path) do nothing;
  end if;
  return new;
end;
$$;

-- This trusted backfill is not a creator write; keep the agreement guard enabled outside this atomic block.
do $$
begin
  execute 'alter table public.storefront_assets disable trigger require_creator_agreement_on_asset_changes';

  with storefront_profile_paths as (
    select storefront.id as storefront_id, storefront.user_id, storefront.profile_image_path as path
    from public.creator_storefronts storefront
    where storefront.profile_image_path is not null

    union

    select
      storefront.id as storefront_id,
      storefront.user_id,
      storefront.published_snapshot ->> 'profile_image_path' as path
    from public.creator_storefronts storefront
    where storefront.published_snapshot ->> 'profile_image_path' is not null
  )
  insert into public.storefront_assets (path, user_id, storefront_id, is_referenced)
  select
    candidate.path,
    candidate.user_id,
    candidate.storefront_id,
    public.storefront_asset_is_referenced(candidate.path)
  from storefront_profile_paths candidate
  where candidate.path ~ (
      '^' || candidate.user_id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
    )
    and exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'storefront-assets'
        and object.name = candidate.path
    )
  on conflict (path) do update
  set is_referenced = excluded.is_referenced
  where public.storefront_assets.user_id = excluded.user_id
    and public.storefront_assets.storefront_id = excluded.storefront_id;

  execute 'alter table public.storefront_assets enable trigger require_creator_agreement_on_asset_changes';
end;
$$;
