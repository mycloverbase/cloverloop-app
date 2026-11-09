alter table public.creator_profiles
  add column if not exists marketing_consent_at timestamptz;

alter table public.creator_profiles
  drop constraint if exists creator_profiles_bio_check,
  add constraint creator_profiles_bio_check check (char_length(bio) <= 1200),
  drop constraint if exists creator_profiles_social_links_check,
  add constraint creator_profiles_social_links_check
    check (jsonb_typeof(social_links) = 'array' and jsonb_array_length(social_links) <= 10);

update public.creator_profiles profile
set username = null
where exists (
    select 1
    from public.creator_storefronts storefront
    where storefront.user_id = profile.user_id
  )
  or (
    profile.username is not null
    and exists (
      select 1
      from public.creator_storefronts storefront
      where storefront.user_id <> profile.user_id
        and lower(storefront.username) = lower(profile.username)
    )
  );

update public.creator_storefronts
set username = username || '-creator-' || left(replace(user_id::text, '-', ''), 8)
where char_length(username) < 3;

update public.creator_profiles profile
set
  display_name = coalesce(nullif(btrim(profile.display_name), ''), storefront.store_name),
  username = storefront.username,
  bio = case
    when nullif(btrim(profile.bio), '') is not null then profile.bio
    else storefront.description
  end,
  social_links = (
    select coalesce(
      jsonb_agg(jsonb_build_object('label', links.label, 'url', links.url) order by links.position),
      '[]'::jsonb
    )
    from (
      select label, url, position
      from (
        select distinct on (lower(available.url))
          available.label,
          available.url,
          available.position
        from (
          select 'Instagram'::text as label, profile.instagram_url as url, 1 as position
          union all
          select 'YouTube', profile.youtube_url, 2
          union all
          select 'Website', profile.website_url, 3
          union all
          select item.value->>'label', item.value->>'url', 10 + item.ordinality::integer
          from jsonb_array_elements(profile.social_links) with ordinality as item(value, ordinality)
          union all
          select
            case
              when item.value->>'platform' = 'Other' then item.value->>'label'
              else item.value->>'platform'
            end,
            item.value->>'url',
            100 + item.ordinality::integer
          from jsonb_array_elements(
            coalesce(storefront.customization->'socialLinks', '[]'::jsonb)
          ) with ordinality as item(value, ordinality)
        ) available
        where available.label is not null
          and available.url is not null
          and btrim(available.label) <> ''
          and btrim(available.url) <> ''
        order by lower(available.url), available.position
      ) unique_links
      order by position
      limit 10
    ) links
  )
from public.creator_storefronts storefront
where storefront.user_id = profile.user_id;

alter table public.creator_profiles
  drop column instagram_url,
  drop column youtube_url,
  drop column website_url;

create or replace function public.save_my_marketing_consent(requested_consent boolean)
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

  insert into public.creator_profiles (
    user_id,
    display_name,
    marketing_emails,
    marketing_consent_at
  )
  select
    current_user_id,
    left(coalesce(
      nullif(btrim(user_row.raw_user_meta_data->>'display_name'), ''),
      nullif(btrim(user_row.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(user_row.raw_user_meta_data->>'name'), ''),
      nullif(split_part(user_row.email, '@', 1), ''),
      'Creator'
    ), 80),
    requested_consent,
    case when requested_consent then now() else null end
  from auth.users user_row
  where user_row.id = current_user_id
  on conflict (user_id) do update
    set marketing_emails = excluded.marketing_emails,
        marketing_consent_at = case
          when requested_consent then now()
          else public.creator_profiles.marketing_consent_at
        end;
end;
$$;

revoke all on function public.save_my_marketing_consent(boolean) from public, anon;
grant execute on function public.save_my_marketing_consent(boolean) to authenticated;

create or replace function public.sync_creator_profile_to_storefront()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  storefront_social_links jsonb;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', md5(links.url),
      'platform', links.platform,
      'label', links.label,
      'url', links.url
    )
    order by links.position
  ), '[]'::jsonb)
  into storefront_social_links
  from (
    select label, url, platform, position
    from (
      select distinct on (lower(available.url))
        available.label,
        available.url,
        available.platform,
        available.position
      from (
        select
          item.value->>'label' as label,
          item.value->>'url' as url,
          case
            when lower(item.value->>'label') = 'instagram' then 'Instagram'
            when lower(item.value->>'label') = 'youtube' then 'YouTube'
            when lower(item.value->>'label') = 'facebook' then 'Facebook'
            when lower(item.value->>'label') = 'linkedin' then 'LinkedIn'
            when lower(item.value->>'label') = 'x' then 'X'
            when lower(item.value->>'label') = 'tiktok' then 'TikTok'
            when lower(item.value->>'label') = 'pinterest' then 'Pinterest'
            when lower(item.value->>'label') = 'threads' then 'Threads'
            when lower(item.value->>'label') = 'twitch' then 'Twitch'
            else 'Other'
          end as platform,
          10 + item.ordinality::integer as position
        from jsonb_array_elements(new.social_links) with ordinality as item(value, ordinality)
      ) available
      where available.label is not null
        and available.url is not null
        and btrim(available.label) <> ''
        and btrim(available.url) <> ''
      order by lower(available.url), available.position
    ) unique_links
    order by position
    limit 10
  ) links;

  update public.creator_storefronts storefront
  set store_name = coalesce(nullif(btrim(new.display_name), ''), storefront.store_name),
      username = coalesce(new.username, storefront.username),
      description = new.bio,
      customization = jsonb_set(
        coalesce(storefront.customization, '{}'::jsonb),
        '{socialLinks}',
        storefront_social_links,
        true
      ),
      published_snapshot = case
        when storefront.status = 'published' and storefront.published_snapshot is not null then
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(storefront.published_snapshot, '{store_name}',
                  to_jsonb(coalesce(nullif(btrim(new.display_name), ''), storefront.store_name)), true),
                '{username}', to_jsonb(coalesce(new.username, storefront.username)), true
              ),
              '{description}', to_jsonb(new.bio), true
            ),
            '{customization,socialLinks}', storefront_social_links, true
          )
        else storefront.published_snapshot
      end
  where storefront.user_id = new.user_id
    and storefront.status <> 'deletion_pending';

  return new;
end;
$$;

create or replace function public.sync_storefront_to_creator_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_social_links jsonb;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('label', links.label, 'url', links.url) order by links.position), '[]'::jsonb)
  into profile_social_links
  from (
    select label, url, position
    from (
      select distinct on (lower(item.value->>'url'))
        case
          when item.value->>'platform' = 'Other' then item.value->>'label'
          else item.value->>'platform'
        end as label,
        item.value->>'url' as url,
        item.ordinality::integer as position
      from jsonb_array_elements(coalesce(new.customization->'socialLinks', '[]'::jsonb))
        with ordinality as item(value, ordinality)
      where item.value->>'url' is not null
        and item.value->>'label' is not null
      order by lower(item.value->>'url'), item.ordinality
    ) unique_links
    order by position
    limit 10
  ) links;

  insert into public.creator_profiles (
    user_id,
    display_name,
    username,
    bio,
    social_links
  )
  values (
    new.user_id,
    new.store_name,
    new.username,
    new.description,
    profile_social_links
  )
  on conflict (user_id) do update
    set     display_name = excluded.display_name,
    username = excluded.username,
    bio = excluded.bio,
    social_links = excluded.social_links;

  return new;
end;
$$;

revoke all on function public.sync_creator_profile_to_storefront() from public, anon, authenticated;
revoke all on function public.sync_storefront_to_creator_profile() from public, anon, authenticated;

create trigger sync_creator_profile_to_storefront
  after insert or update of display_name, username, bio, social_links
  on public.creator_profiles
  for each row execute function public.sync_creator_profile_to_storefront();

create trigger sync_storefront_to_creator_profile
  after insert or update of store_name, username, description, customization
  on public.creator_storefronts
  for each row execute function public.sync_storefront_to_creator_profile();
