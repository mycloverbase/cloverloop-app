create table public.creator_agreement_versions (
  agreement_id text not null,
  version text not null,
  effective_at timestamptz not null,
  introduced_at timestamptz not null default now(),
  required_for_existing boolean not null default false,
  document_path text not null,
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (agreement_id, version),
  check (agreement_id = 'creator_agreement'),
  check (version ~ '^[0-9]+\.[0-9]+$'),
  check (document_path ~ '^content/legal/creator-agreement-v[0-9]+\.[0-9]+\.md$')
);

create table public.creator_agreement_current_versions (
  agreement_id text primary key,
  version text not null,
  foreign key (agreement_id, version)
    references public.creator_agreement_versions (agreement_id, version)
);

create table public.creator_agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  agreement_id text not null,
  version text not null,
  accepted_at timestamptz not null,
  acceptance_status text not null check (acceptance_status = 'accepted'),
  age_confirmed boolean not null check (age_confirmed),
  ip_address inet,
  created_at timestamptz not null default now(),
  unique (user_id, agreement_id, version),
  foreign key (agreement_id, version)
    references public.creator_agreement_versions (agreement_id, version)
);

insert into public.creator_agreement_versions (
  agreement_id,
  version,
  effective_at,
  required_for_existing,
  document_path,
  document_sha256
)
values (
  'creator_agreement',
  '1.0',
  '2026-11-12 00:00:00+00',
  false,
  'content/legal/creator-agreement-v1.0.md',
  '78f03248f8228ec9d5d2ad880d6f3d5d20a24fdd9a0f63b0b63f3a9d6f034337'
);

insert into public.creator_agreement_current_versions (agreement_id, version)
values ('creator_agreement', '1.0');

alter table public.creator_agreement_versions enable row level security;
alter table public.creator_agreement_current_versions enable row level security;
alter table public.creator_agreement_acceptances enable row level security;

revoke all on public.creator_agreement_versions,
  public.creator_agreement_current_versions,
  public.creator_agreement_acceptances
from public, anon, authenticated;
grant all on public.creator_agreement_versions,
  public.creator_agreement_current_versions,
  public.creator_agreement_acceptances
to service_role;

create or replace function public.prevent_creator_agreement_record_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Creator agreement records are immutable';
end;
$$;

create trigger creator_agreement_versions_immutable
  before update or delete on public.creator_agreement_versions
  for each row execute function public.prevent_creator_agreement_record_mutation();

create trigger creator_agreement_acceptances_immutable
  before update or delete on public.creator_agreement_acceptances
  for each row execute function public.prevent_creator_agreement_record_mutation();

create or replace function public.creator_agreement_access_granted()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  account_created_at timestamptz;
  agreement_version public.creator_agreement_versions%rowtype;
begin
  if auth.role() = 'service_role' then
    return true;
  end if;

  if current_user_id is null then
    return false;
  end if;

  select created_at
  into account_created_at
  from auth.users
  where id = current_user_id;

  if account_created_at is null then
    return false;
  end if;

  select version_record.*
  into agreement_version
  from public.creator_agreement_current_versions current_version
  join public.creator_agreement_versions version_record
    on version_record.agreement_id = current_version.agreement_id
    and version_record.version = current_version.version
  where current_version.agreement_id = 'creator_agreement';

  if not found then
    return false;
  end if;

  if exists (
    select 1
    from public.creator_agreement_acceptances acceptance
    where acceptance.user_id = current_user_id
      and acceptance.agreement_id = agreement_version.agreement_id
      and acceptance.version = agreement_version.version
      and acceptance.acceptance_status = 'accepted'
  ) then
    return true;
  end if;

  return not agreement_version.required_for_existing
    and account_created_at < agreement_version.introduced_at
    and (
      exists (
        select 1
        from public.creator_profiles profile
        where profile.user_id = current_user_id
      )
      or exists (
        select 1
        from public.creator_storefronts storefront
        where storefront.user_id = current_user_id
      )
    );
end;
$$;

create or replace function public.get_my_creator_agreement_status()
returns table (
  agreement_id text,
  version text,
  effective_at timestamptz,
  required_for_existing boolean,
  accepted boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    version_record.agreement_id,
    version_record.version,
    version_record.effective_at,
    version_record.required_for_existing,
    public.creator_agreement_access_granted()
  from public.creator_agreement_current_versions current_version
  join public.creator_agreement_versions version_record
    on version_record.agreement_id = current_version.agreement_id
    and version_record.version = current_version.version
  where current_version.agreement_id = 'creator_agreement'
    and auth.uid() is not null;
$$;

create or replace function public.get_my_plan_entitlements()
returns setof public.plan_entitlements
language sql
stable
security definer
set search_path = ''
as $$
  select entitlements.*
  from public.plan_entitlements entitlements
  where entitlements.creator_id = auth.uid()
    and public.creator_agreement_access_granted();
$$;

create or replace function public.get_my_free_product_claim_stats()
returns table (
  product_id uuid,
  product_name text,
  claim_count bigint,
  successful_download_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    product.id,
    product.name,
    count(claim.id),
    coalesce(sum(claim.download_count), 0)
  from public.storefront_products product
  left join public.product_claims claim
    on claim.product_id = product.id
   and claim.creator_id = auth.uid()
  where product.user_id = auth.uid()
    and product.is_free
    and product.deleted_at is null
    and public.creator_agreement_access_granted()
  group by product.id, product.name
  order by product.name;
$$;

revoke all on function public.creator_agreement_access_granted() from public, anon;
revoke all on function public.get_my_creator_agreement_status() from public, anon;
grant execute on function public.creator_agreement_access_granted() to authenticated;
grant execute on function public.get_my_creator_agreement_status() to authenticated;

create or replace function public.enforce_creator_agreement_on_plan_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.creator_agreement_access_granted() then
    return new;
  end if;
  raise exception 'Creator Agreement acceptance is required'
    using errcode = '42501';
end;
$$;

create trigger require_creator_agreement_on_plan_changes
  before insert or update on public.creator_plan_changes
  for each row execute function public.enforce_creator_agreement_on_plan_changes();

create or replace function public.enforce_creator_agreement_before_creator_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;
  if public.creator_agreement_access_granted() then
    return new;
  end if;
  raise exception 'Creator Agreement acceptance is required'
    using errcode = '42501';
end;
$$;

create trigger require_creator_agreement_on_profile_changes
  before insert or update or delete on public.creator_profiles
  for each row execute function public.enforce_creator_agreement_before_creator_changes();

create trigger require_creator_agreement_on_storefront_changes
  before insert or update or delete on public.creator_storefronts
  for each row execute function public.enforce_creator_agreement_before_creator_changes();

create trigger require_creator_agreement_on_asset_changes
  before insert or update or delete on public.storefront_assets
  for each row execute function public.enforce_creator_agreement_before_creator_changes();

create trigger require_creator_agreement_on_product_changes
  before insert or update or delete on public.storefront_products
  for each row execute function public.enforce_creator_agreement_before_creator_changes();

create trigger require_creator_agreement_on_feedback_changes
  before insert or update or delete on public.creator_feedback
  for each row execute function public.enforce_creator_agreement_before_creator_changes();

create policy "Creator agreement required for profiles"
  on public.creator_profiles as restrictive for all to authenticated
  using (public.creator_agreement_access_granted())
  with check (public.creator_agreement_access_granted());

create policy "Creator agreement required for feedback"
  on public.creator_feedback as restrictive for all to authenticated
  using (public.creator_agreement_access_granted())
  with check (public.creator_agreement_access_granted());

create policy "Creator agreement required for storefronts"
  on public.creator_storefronts as restrictive for all to authenticated
  using (public.creator_agreement_access_granted())
  with check (public.creator_agreement_access_granted());

create policy "Creator agreement required for storefront assets"
  on public.storefront_assets as restrictive for all to authenticated
  using (public.creator_agreement_access_granted())
  with check (public.creator_agreement_access_granted());

create policy "Creator agreement required for products"
  on public.storefront_products as restrictive for all to authenticated
  using (public.creator_agreement_access_granted())
  with check (public.creator_agreement_access_granted());

create policy "Creator agreement required for product claims"
  on public.product_claims as restrictive for all to authenticated
  using (public.creator_agreement_access_granted())
  with check (public.creator_agreement_access_granted());

create policy "Creator agreement required for creator storage"
  on storage.objects as restrictive for all to authenticated
  using (
    bucket_id not in ('creator-avatars', 'storefront-assets', 'product-files')
    or public.creator_agreement_access_granted()
  )
  with check (
    bucket_id not in ('creator-avatars', 'storefront-assets', 'product-files')
    or public.creator_agreement_access_granted()
  );
