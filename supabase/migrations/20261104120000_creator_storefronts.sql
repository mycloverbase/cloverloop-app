create table public.storefront_reserved_usernames (
  username text primary key check (username = lower(username))
);

insert into public.storefront_reserved_usernames (username)
values
  ('about'), ('account'), ('admin'), ('api'), ('apple-icon'), ('auth'), ('clover'),
  ('cloverbase'), ('clover-loop'), ('cloverloop'), ('compare'), ('contact'), ('courses'),
  ('cookies'), ('creator'), ('dashboard'), ('disclaimer'), ('faq'), ('favicon'), ('features'),
  ('founding-creators'), ('forgot-password'), ('guides'), ('help'), ('help-center'), ('icon'),
  ('images'), ('login'), ('logout'), ('opengraph-image'), ('partner-program'),
  ('payment-gateways'), ('pricing'), ('privacy'), ('refunds'), ('resources'), ('reviews'),
  ('robots'), ('sell-digital-downloads'), ('sell-online'), ('signup'), ('sitemap'),
  ('search'), ('start'), ('store-builder'), ('storefront'), ('support'), ('terms'), ('www'),
  ('_next'), ('_vercel')
on conflict (username) do nothing;

create table public.creator_storefronts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  store_name text not null check (char_length(store_name) between 1 and 80),
  username text not null check (
    username = lower(username)
    and username ~ '^[a-z0-9_-]{1,30}$'
  ),
  description text not null default '' check (char_length(description) <= 1200),
  profile_image_path text,
  banner_image_path text,
  theme text not null default 'minimal' check (theme in ('minimal', 'editorial', 'bold')),
  customization jsonb not null default
    '{"primaryColor":"#2f7254","accentColor":"#a8c9a5","backgroundColor":"#ffffff","productLayout":"grid","bannerStyle":"wide","sectionOrder":["about","products","social","contact"],"hiddenSections":[],"products":[],"socialLinks":[],"publicEmail":""}'::jsonb
    check (jsonb_typeof(customization) = 'object'),
  published_snapshot jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'unpublished', 'deletion_pending')),
  published_at timestamptz,
  unpublished_at timestamptz,
  deleted_at timestamptz,
  delete_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_storefront_profile_path_owner check (
    profile_image_path is null
    or profile_image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
  ),
  constraint creator_storefront_banner_path_owner check (
    banner_image_path is null
    or banner_image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
  ),
  constraint creator_storefront_deletion_state check (
    (status = 'deletion_pending' and deleted_at is not null and delete_after is not null)
    or (status <> 'deletion_pending' and deleted_at is null and delete_after is null)
  ),
  constraint creator_storefront_published_snapshot check (
    status <> 'published' or published_snapshot is not null
  )
);

create unique index creator_storefronts_username_lower_key
  on public.creator_storefronts (lower(username));
create index creator_storefronts_published_username_idx
  on public.creator_storefronts (username)
  where status = 'published' and deleted_at is null;
create index creator_storefronts_delete_after_idx
  on public.creator_storefronts (delete_after)
  where status = 'deletion_pending';

create table public.storefront_username_claims (
  username text primary key,
  storefront_id uuid not null references public.creator_storefronts (id) on delete cascade,
  claim_kind text not null check (claim_kind in ('current', 'redirect')),
  created_at timestamptz not null default now(),
  check (username = lower(username))
);

create unique index storefront_one_current_username
  on public.storefront_username_claims (storefront_id)
  where claim_kind = 'current';
create index storefront_username_claims_store_idx
  on public.storefront_username_claims (storefront_id);

create table public.storefront_assets (
  path text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  storefront_id uuid not null references public.creator_storefronts (id) on delete cascade,
  is_referenced boolean not null default false,
  created_at timestamptz not null default now(),
  check (path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$')
);

create index storefront_assets_unreferenced_idx
  on public.storefront_assets (created_at)
  where is_referenced = false;

alter table public.creator_storefronts enable row level security;
alter table public.storefront_username_claims enable row level security;
alter table public.storefront_assets enable row level security;

grant select on public.creator_storefronts to authenticated;
grant select on public.storefront_assets to authenticated;

create policy "Creators can read their own storefront"
  on public.creator_storefronts for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Creators can read their own storefront assets"
  on public.storefront_assets for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.set_creator_storefront_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_creator_storefront_updated_at
  before update on public.creator_storefronts
  for each row execute function public.set_creator_storefront_updated_at();

create or replace function public.sync_storefront_username_claims()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  if exists (
    select 1
    from public.storefront_reserved_usernames reserved
    where reserved.username = lower(new.username)
  ) then
    raise exception 'That username is reserved. Choose another name.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if lower(new.username) = lower(old.username) then
      if new.status = 'published'
        and new.published_snapshot is not null
        and new.store_name is distinct from old.store_name
      then
        update public.creator_storefronts
        set published_snapshot = jsonb_set(
          published_snapshot,
          '{store_name}',
          to_jsonb(new.store_name)
        )
        where id = new.id;
      end if;
      return new;
    end if;

    update public.storefront_username_claims
    set claim_kind = 'redirect'
    where username = lower(old.username)
      and storefront_id = old.id
      and claim_kind = 'current';
  end if;

  insert into public.storefront_username_claims (username, storefront_id, claim_kind)
  values (lower(new.username), new.id, 'current')
  on conflict (username) do update
    set claim_kind = 'current'
    where public.storefront_username_claims.storefront_id = new.id
      and public.storefront_username_claims.claim_kind = 'redirect';

  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    raise exception 'That username is already taken. Try another one.'
      using errcode = '23505';
  end if;

  if tg_op = 'UPDATE'
    and new.status = 'published'
    and new.published_snapshot is not null
  then
    update public.creator_storefronts
    set published_snapshot = jsonb_set(
      jsonb_set(published_snapshot, '{store_name}', to_jsonb(new.store_name)),
      '{username}',
      to_jsonb(new.username)
    )
    where id = new.id;
  end if;

  return new;
end;
$$;

create trigger sync_storefront_username_claims
  after insert or update on public.creator_storefronts
  for each row execute function public.sync_storefront_username_claims();

create or replace view public.published_storefronts
with (security_barrier = true)
as
select
  published_snapshot->>'store_name' as store_name,
  published_snapshot->>'username' as username,
  published_snapshot->>'description' as description,
  published_snapshot->>'profile_image_path' as profile_image_path,
  published_snapshot->>'banner_image_path' as banner_image_path,
  published_snapshot->>'theme' as theme,
  published_snapshot->'customization' as customization,
  published_at
from public.creator_storefronts
where status = 'published'
  and deleted_at is null
  and published_snapshot is not null;

grant select on public.published_storefronts to anon, authenticated;

create or replace function public.storefront_username_available(requested_username text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_username text := lower(trim(requested_username));
  own_storefront_id uuid;
begin
  if auth.uid() is null
    or normalized_username !~ '^[a-z0-9_-]{1,30}$'
    or exists (
      select 1 from public.storefront_reserved_usernames
      where username = normalized_username
    )
  then
    return false;
  end if;

  select id into own_storefront_id
  from public.creator_storefronts
  where user_id = auth.uid();

  return not exists (
    select 1
    from public.storefront_username_claims
    where username = normalized_username
      and (own_storefront_id is null or storefront_id <> own_storefront_id)
  );
end;
$$;

create or replace function public.storefront_redirect_target(requested_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select storefront.username
  from public.storefront_username_claims claim
  join public.creator_storefronts storefront on storefront.id = claim.storefront_id
  where claim.username = lower(trim(requested_username))
    and claim.claim_kind = 'redirect'
    and storefront.status <> 'deletion_pending'
    and storefront.deleted_at is null
  limit 1
$$;

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
  ) or requested_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$' then
    raise exception 'The uploaded image could not be associated with this storefront.'
      using errcode = '23514';
  end if;

  insert into public.storefront_assets (path, user_id, storefront_id)
  values (requested_path, current_user_id, requested_storefront_id);
end;
$$;

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
    select 1 from public.storefront_assets asset
    where asset.path = requested_profile_image_path
      and asset.storefront_id = v_storefront_id
      and asset.user_id = current_user_id
  ) then
    raise exception 'The profile image has not finished uploading.'
      using errcode = '23514';
  end if;
  if requested_banner_image_path is not null and not exists (
    select 1 from public.storefront_assets asset
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
        select 1 from public.storefront_assets asset
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

create or replace function public.publish_my_storefront()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
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
  where user_id = current_user_id
    and status <> 'deletion_pending'
    and char_length(trim(store_name)) > 0
    and profile_image_path is not null
    and exists (
      select 1 from public.storefront_assets asset
      where asset.path = profile_image_path
        and asset.storefront_id = creator_storefronts.id
        and asset.is_referenced
    );
  if not found then
    raise exception 'Add a store name and profile image before publishing.'
      using errcode = '23514';
  end if;

  update public.storefront_assets asset
  set is_referenced = (
    asset.path = storefront.profile_image_path
    or asset.path = storefront.banner_image_path
    or exists (
      select 1
      from jsonb_array_elements(storefront.customization->'products') item(value)
      where item.value->>'coverImagePath' = asset.path
    )
  )
  from public.creator_storefronts storefront
  where storefront.user_id = current_user_id
    and asset.storefront_id = storefront.id;
end;
$$;

create or replace function public.unpublish_my_storefront()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.creator_storefronts
  set status = 'unpublished',
      unpublished_at = now(),
      published_at = null
  where user_id = auth.uid()
    and status <> 'deletion_pending';
  if not found then
    raise exception 'Your storefront could not be found.'
      using errcode = 'P0002';
  end if;

  update public.storefront_assets asset
  set is_referenced = (
    asset.path = storefront.profile_image_path
    or asset.path = storefront.banner_image_path
    or exists (
      select 1
      from jsonb_array_elements(storefront.customization->'products') item(value)
      where item.value->>'coverImagePath' = asset.path
    )
  )
  from public.creator_storefronts storefront
  where storefront.user_id = auth.uid()
    and asset.storefront_id = storefront.id;
end;
$$;

create or replace function public.delete_my_storefront()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.creator_storefronts
  set status = 'deletion_pending',
      deleted_at = now(),
      delete_after = now() + interval '30 days',
      published_at = null
  where user_id = auth.uid()
    and status <> 'deletion_pending';
  if not found then
    raise exception 'Your storefront could not be found or is already scheduled for deletion.'
      using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.delete_my_account()
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
  if exists (
    select 1 from public.creator_storefronts
    where user_id = current_user_id
  ) then
    raise exception 'A storefront must complete its 30-day deletion period before account deletion.'
      using errcode = '23514';
  end if;

  delete from auth.users where id = current_user_id;
  if not found then
    raise exception 'Account was not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.is_published_storefront_asset(requested_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.storefront_assets asset
    join public.creator_storefronts storefront on storefront.id = asset.storefront_id
    where asset.path = requested_path
      and storefront.status = 'published'
      and storefront.deleted_at is null
      and (
        requested_path = storefront.published_snapshot->>'profile_image_path'
        or requested_path = storefront.published_snapshot->>'banner_image_path'
        or exists (
          select 1
          from jsonb_array_elements(coalesce(
            storefront.published_snapshot->'customization'->'products',
            '[]'::jsonb
          )) item(value)
          where item.value->>'coverImagePath' = requested_path
        )
      )
  )
$$;

revoke all on public.storefront_reserved_usernames from public, anon, authenticated;
revoke all on public.storefront_username_claims from public, anon, authenticated;
revoke all on public.creator_storefronts from anon;
revoke insert, update, delete on public.creator_storefronts from authenticated;
revoke insert, update, delete on public.storefront_assets from public, anon, authenticated;
revoke all on function public.sync_storefront_username_claims() from public, anon, authenticated;
revoke all on function public.set_creator_storefront_updated_at() from public, anon, authenticated;
revoke all on function public.storefront_username_available(text) from public, anon;
revoke all on function public.storefront_redirect_target(text) from public, authenticated;
revoke all on function public.register_storefront_asset(uuid, text) from public, anon;
revoke all on function public.save_my_storefront(text, text, text, text, text, text, jsonb) from public, anon;
revoke all on function public.publish_my_storefront() from public, anon;
revoke all on function public.unpublish_my_storefront() from public, anon;
revoke all on function public.delete_my_storefront() from public, anon;
revoke all on function public.is_published_storefront_asset(text) from public, authenticated;
grant execute on function public.storefront_username_available(text) to authenticated;
grant execute on function public.storefront_redirect_target(text) to anon, authenticated;
grant execute on function public.register_storefront_asset(uuid, text) to authenticated;
grant execute on function public.save_my_storefront(text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.publish_my_storefront() to authenticated;
grant execute on function public.unpublish_my_storefront() to authenticated;
grant execute on function public.delete_my_storefront() to authenticated;
grant execute on function public.is_published_storefront_asset(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'storefront-assets',
  'storefront-assets',
  false,
  10485760,
  array['image/webp']::text[]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Creators can read their own storefront images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'storefront-assets'
    and exists (
      select 1 from public.storefront_assets asset
      where asset.path = name and asset.user_id = (select auth.uid())
    )
  );

create policy "Creators can delete their own storefront images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'storefront-assets'
    and exists (
      select 1 from public.storefront_assets asset
      where asset.path = name and asset.user_id = (select auth.uid())
    )
  );

create policy "Published storefront images are publicly readable"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'storefront-assets'
    and public.is_published_storefront_asset(name)
  );

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-expired-storefronts') then
    perform cron.unschedule('purge-expired-storefronts');
  end if;
  perform cron.schedule(
    'purge-expired-storefronts',
    '15 3 * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
          || '/functions/v1/purge-storefronts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets where name = 'storefront_purge_secret'
          )
        ),
        body := '{}'::jsonb
      );
    $job$
  );
end;
$$;
