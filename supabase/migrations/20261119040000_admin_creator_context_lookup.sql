create or replace function public.admin_lookup_creator_context_by_email(
  requested_creator_email text
)
returns table (
  creator_id uuid,
  creator_email text,
  profile_name text,
  storefront_id uuid,
  storefront_name text,
  username text,
  storefront_status text,
  deleted_at timestamptz,
  delete_after timestamptz,
  can_restore boolean,
  plan_key text,
  founder_status text,
  subscription_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(requested_creator_email));
begin
  if not public.is_cloverloop_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if normalized_email is null
    or char_length(normalized_email) > 254
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid registered email address is required';
  end if;

  return query
  select
    account.id,
    account.email::text,
    profile.display_name,
    storefront.id,
    storefront.store_name,
    storefront.username,
    storefront.status,
    storefront.deleted_at,
    storefront.delete_after,
    coalesce(
      storefront.status = 'deletion_pending'
      and storefront.delete_after > now(),
      false
    ),
    entitlement.plan_key,
    entitlement.founder_status,
    entitlement.subscription_status
  from auth.users as account
  left join public.creator_profiles as profile on profile.user_id = account.id
  left join public.creator_storefronts as storefront on storefront.user_id = account.id
  left join public.plan_entitlements as entitlement on entitlement.creator_id = account.id
  where lower(account.email) = normalized_email
  order by account.created_at desc
  limit 1;
end;
$$;

revoke all on function public.admin_lookup_creator_context_by_email(text)
  from public, anon, authenticated;
grant execute on function public.admin_lookup_creator_context_by_email(text)
  to authenticated;
