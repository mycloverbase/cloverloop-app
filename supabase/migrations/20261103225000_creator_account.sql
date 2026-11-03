create table if not exists public.creator_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  username text check (
    username is null
    or username ~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,28}[A-Za-z0-9]$'
  ),
  bio text not null default '' check (char_length(bio) <= 280),
  location text check (location is null or char_length(location) <= 80),
  instagram_url text,
  youtube_url text,
  website_url text,
  social_links jsonb not null default '[]'::jsonb
    check (jsonb_typeof(social_links) = 'array' and jsonb_array_length(social_links) <= 5),
  avatar_path text,
  product_announcements boolean not null default true,
  marketing_emails boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_profiles_instagram_url_scheme
    check (instagram_url is null or instagram_url ~* '^https?://[^[:space:]]+$'),
  constraint creator_profiles_youtube_url_scheme
    check (youtube_url is null or youtube_url ~* '^https?://[^[:space:]]+$'),
  constraint creator_profiles_website_url_scheme
    check (website_url is null or website_url ~* '^https?://[^[:space:]]+$'),
  constraint creator_profiles_avatar_path_owner
    check (avatar_path is null or substring(avatar_path from 1 for 37) = user_id::text || '/')
);

create unique index if not exists creator_profiles_username_lower_key
  on public.creator_profiles (lower(username))
  where username is not null;

alter table public.creator_profiles enable row level security;

grant select, insert, update on public.creator_profiles to authenticated;

create policy "Creators can read their own profile"
  on public.creator_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Creators can create their own profile"
  on public.creator_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Creators can update their own profile"
  on public.creator_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.set_creator_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_creator_profile_updated_at
  before update on public.creator_profiles
  for each row execute function public.set_creator_profile_updated_at();

create table if not exists public.creator_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('general', 'account', 'product', 'other')),
  message text not null check (char_length(message) between 10 and 2000),
  created_at timestamptz not null default now()
);

alter table public.creator_feedback enable row level security;

grant insert on public.creator_feedback to authenticated;

create policy "Creators can submit their own feedback"
  on public.creator_feedback for insert to authenticated
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creator-avatars',
  'creator-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do nothing;

create policy "Creators can view their own avatar files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'creator-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Creators can upload their own avatar files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'creator-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Creators can delete their own avatar files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'creator-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

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

  delete from auth.users where id = current_user_id;

  if not found then
    raise exception 'Account was not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
