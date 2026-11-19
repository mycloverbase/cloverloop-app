create table public.creator_storefront_recovery_audit (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null,
  creator_id uuid not null,
  creator_email text,
  store_name text not null,
  username text not null,
  actor_user_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  deleted_at_at_recovery timestamptz not null,
  delete_after_at_recovery timestamptz not null,
  restored_at timestamptz not null default now()
);

alter table public.creator_storefront_recovery_audit enable row level security;
revoke all on public.creator_storefront_recovery_audit from public, anon, authenticated;

create or replace function public.admin_storefront_deletion_queue()
returns table (
  storefront_id uuid,
  creator_id uuid,
  creator_email text,
  store_name text,
  username text,
  deleted_at timestamptz,
  delete_after timestamptz,
  can_restore boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_cloverloop_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  select
    storefront.id,
    storefront.user_id,
    account.email,
    storefront.store_name,
    storefront.username,
    storefront.deleted_at,
    storefront.delete_after,
    storefront.delete_after > now()
  from public.creator_storefronts as storefront
  left join auth.users as account on account.id = storefront.user_id
  where storefront.status = 'deletion_pending'
  order by storefront.delete_after asc;
end;
$$;

create or replace function public.admin_restore_storefront(
  requested_storefront_id uuid,
  requested_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  storefront_creator_id uuid;
  storefront_email text;
  storefront_name text;
  storefront_username text;
  storefront_deleted_at timestamptz;
  storefront_delete_after timestamptz;
begin
  if not public.is_cloverloop_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if requested_storefront_id is null
    or requested_reason is null
    or char_length(btrim(requested_reason)) not between 5 and 500 then
    raise exception 'A valid storefront and a reason of 5-500 characters are required';
  end if;

  select
    storefront.user_id,
    account.email,
    storefront.store_name,
    storefront.username,
    storefront.deleted_at,
    storefront.delete_after
  into
    storefront_creator_id,
    storefront_email,
    storefront_name,
    storefront_username,
    storefront_deleted_at,
    storefront_delete_after
  from public.creator_storefronts as storefront
  left join auth.users as account on account.id = storefront.user_id
  where storefront.id = requested_storefront_id
    and storefront.status = 'deletion_pending'
  for update of storefront;

  if not found then
    raise exception 'The storefront is not pending deletion.' using errcode = 'P0002';
  end if;
  if storefront_delete_after <= clock_timestamp() then
    raise exception 'The storefront deletion grace period has expired.' using errcode = 'P0001';
  end if;

  update public.creator_storefronts
  set status = 'unpublished',
      deleted_at = null,
      delete_after = null,
      published_at = null,
      unpublished_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = requested_storefront_id
    and status = 'deletion_pending';

  insert into public.creator_storefront_recovery_audit (
    storefront_id,
    creator_id,
    creator_email,
    store_name,
    username,
    actor_user_id,
    reason,
    deleted_at_at_recovery,
    delete_after_at_recovery
  )
  values (
    requested_storefront_id,
    storefront_creator_id,
    storefront_email,
    storefront_name,
    storefront_username,
    auth.uid(),
    btrim(requested_reason),
    storefront_deleted_at,
    storefront_delete_after
  );

  return storefront_username;
end;
$$;

revoke all on function public.admin_storefront_deletion_queue() from public, anon, authenticated;
revoke all on function public.admin_restore_storefront(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_storefront_deletion_queue() to authenticated;
grant execute on function public.admin_restore_storefront(uuid, text) to authenticated;
