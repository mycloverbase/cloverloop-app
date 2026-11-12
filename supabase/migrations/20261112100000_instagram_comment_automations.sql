create table public.instagram_connections (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  instagram_user_id text not null unique,
  instagram_username text not null,
  access_token_encrypted text,
  token_expires_at timestamptz not null,
  granted_scopes text[] not null default '{}',
  connection_status text not null default 'connected'
    check (connection_status in ('connected', 'reauthorization_required', 'disconnected')),
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, instagram_user_id)
);

create index instagram_connections_refresh_idx
  on public.instagram_connections (token_expires_at)
  where connection_status = 'connected';

create table public.instagram_automations (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  instagram_connection_id uuid not null references public.instagram_connections (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  media_id text not null,
  media_type text not null check (media_type in ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM')),
  media_permalink text not null,
  media_caption text not null default '',
  trigger_keywords text[] not null check (
    cardinality(trigger_keywords) between 1 and 10
    and array_position(trigger_keywords, null) is null
  ),
  match_type text not null default 'whole_word'
    check (match_type in ('whole_word', 'exact_comment')),
  reply_message text not null check (char_length(btrim(reply_message)) between 1 and 900),
  target_product_id uuid,
  status text not null default 'paused' check (status in ('active', 'paused')),
  total_comments_received bigint not null default 0 check (total_comments_received >= 0),
  total_comments_matched bigint not null default 0 check (total_comments_matched >= 0),
  total_messages_sent bigint not null default 0 check (total_messages_sent >= 0),
  total_messages_failed bigint not null default 0 check (total_messages_failed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index instagram_automations_media_idx
  on public.instagram_automations (instagram_connection_id, media_id, created_at)
  where status = 'active';

create table public.instagram_comment_events (
  id uuid primary key default gen_random_uuid(),
  instagram_connection_id uuid not null references public.instagram_connections (id) on delete cascade,
  automation_id uuid references public.instagram_automations (id) on delete set null,
  instagram_comment_id text not null,
  instagram_media_id text not null,
  commenter_id text,
  comment_text text,
  comment_timestamp timestamptz,
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'sent', 'failed', 'ignored')),
  matched_keyword text,
  message_id text,
  error_code text,
  error_message text,
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (instagram_connection_id, instagram_comment_id)
);

create index instagram_comment_events_queue_idx
  on public.instagram_comment_events (next_attempt_at, created_at)
  where processing_status = 'pending';
create index instagram_comment_events_automation_idx
  on public.instagram_comment_events (automation_id, processing_status);
create index instagram_comment_events_retention_idx
  on public.instagram_comment_events (created_at)
  where commenter_id is not null or comment_text is not null;

create table public.instagram_api_rate_limits (
  creator_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (creator_id, bucket)
);

create trigger set_instagram_connections_updated_at
  before update on public.instagram_connections
  for each row execute function public.set_creator_storefront_updated_at();

create trigger set_instagram_automations_updated_at
  before update on public.instagram_automations
  for each row execute function public.set_creator_storefront_updated_at();

alter table public.instagram_connections enable row level security;
alter table public.instagram_automations enable row level security;
alter table public.instagram_comment_events enable row level security;
alter table public.instagram_api_rate_limits enable row level security;

revoke all on public.instagram_connections, public.instagram_automations,
  public.instagram_comment_events, public.instagram_api_rate_limits
from public, anon, authenticated;
grant all on public.instagram_connections, public.instagram_automations,
  public.instagram_comment_events, public.instagram_api_rate_limits to service_role;

create or replace function public.guard_instagram_automation_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' and not exists (
    select 1
    from public.instagram_connections connection
    where connection.id = new.instagram_connection_id
      and connection.creator_id = new.creator_id
      and connection.connection_status = 'connected'
  ) then
    raise exception 'Instagram connection is not available for this creator';
  end if;

  if new.status = 'active' and new.target_product_id is not null and not exists (
    select 1
    from public.storefront_products product
    join public.creator_storefronts storefront on storefront.id = product.storefront_id
    where product.id = new.target_product_id
      and product.user_id = new.creator_id
      and product.is_active
      and product.deleted_at is null
      and storefront.status = 'published'
      and storefront.deleted_at is null
  ) then
    raise exception 'The selected product is not available on the creator storefront';
  end if;

  if new.status = 'active' then
    perform pg_advisory_xact_lock(hashtext(new.instagram_connection_id::text || ':' || new.media_id));
    if exists (
      select 1
      from public.instagram_automations existing
      cross join lateral unnest(existing.trigger_keywords) existing_keyword
      cross join lateral unnest(new.trigger_keywords) requested_keyword
      where existing.instagram_connection_id = new.instagram_connection_id
        and existing.media_id = new.media_id
        and existing.status = 'active'
        and existing.id is distinct from new.id
        and lower(btrim(existing_keyword)) = lower(btrim(requested_keyword))
    ) then
      raise exception 'An active automation already uses one of these keywords for this post';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_instagram_automation_owner
  before insert or update on public.instagram_automations
  for each row execute function public.guard_instagram_automation_owner();

create or replace function public.track_instagram_comment_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.instagram_automations
  set total_comments_received = total_comments_received + 1
  where instagram_connection_id = new.instagram_connection_id
    and media_id = new.instagram_media_id;
  return new;
end;
$$;

create trigger track_instagram_comment_received
  after insert on public.instagram_comment_events
  for each row execute function public.track_instagram_comment_received();

create or replace function public.increment_instagram_automation_counter(
  requested_automation_id uuid,
  requested_counter text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.instagram_automations
  set total_messages_sent = total_messages_sent
        + case when requested_counter = 'sent' then 1 else 0 end,
      total_messages_failed = total_messages_failed
        + case when requested_counter = 'failed' then 1 else 0 end
  where id = requested_automation_id
    and requested_counter in ('sent', 'failed');
  if not found then
    raise exception 'Instagram automation counter could not be updated';
  end if;
end;
$$;

revoke all on function public.increment_instagram_automation_counter(uuid, text) from public, anon, authenticated;
grant execute on function public.increment_instagram_automation_counter(uuid, text) to service_role;

create or replace function public.record_instagram_automation_match(
  requested_event_id uuid,
  requested_automation_id uuid,
  requested_keyword text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched boolean;
begin
  if requested_event_id is null
    or requested_automation_id is null
    or requested_keyword is null
    or char_length(btrim(requested_keyword)) not between 1 and 40 then
    raise exception 'Invalid Instagram match record';
  end if;

  update public.instagram_comment_events event
  set automation_id = requested_automation_id,
      matched_keyword = requested_keyword
  where event.id = requested_event_id
    and event.processing_status = 'processing'
    and event.automation_id is null
    and exists (
      select 1
      from public.instagram_automations automation
      where automation.id = requested_automation_id
        and automation.instagram_connection_id = event.instagram_connection_id
        and automation.media_id = event.instagram_media_id
        and automation.status = 'active'
    );
  if found then
    update public.instagram_automations
    set total_comments_matched = total_comments_matched + 1
    where id = requested_automation_id;
    return true;
  end if;

  select event.automation_id = requested_automation_id
    into matched
  from public.instagram_comment_events event
  where event.id = requested_event_id
    and event.processing_status = 'processing';
  return coalesce(matched, false);
end;
$$;

revoke all on function public.record_instagram_automation_match(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_instagram_automation_match(uuid, uuid, text) to service_role;

create or replace function public.check_instagram_rate_limit(
  requested_creator_id uuid,
  requested_bucket text,
  requested_maximum integer,
  requested_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  if requested_creator_id is null
    or requested_bucket is null
    or char_length(requested_bucket) not between 1 and 80
    or requested_maximum not between 1 and 10000
    or requested_window_seconds not between 1 and 86400 then
    raise exception 'Invalid Instagram rate limit request';
  end if;

  insert into public.instagram_api_rate_limits as limits (
    creator_id, bucket, window_started_at, request_count
  ) values (requested_creator_id, requested_bucket, now(), 1)
  on conflict (creator_id, bucket) do update
  set window_started_at = case
        when limits.window_started_at <= now() - make_interval(secs => requested_window_seconds) then now()
        else limits.window_started_at
      end,
      request_count = case
        when limits.window_started_at <= now() - make_interval(secs => requested_window_seconds) then 1
        else limits.request_count + 1
      end
  returning request_count into current_count;
  return current_count <= requested_maximum;
end;
$$;

revoke all on function public.check_instagram_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_instagram_rate_limit(uuid, text, integer, integer) to service_role;
