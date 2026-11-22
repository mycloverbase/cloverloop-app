create table public.creator_support_requests (
  id uuid primary key default gen_random_uuid(),
  request_reference text not null unique default (
    'CL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
  ),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in (
    'products',
    'storefront',
    'payments_payouts',
    'account_profile',
    'plans_billing',
    'instagram_automation',
    'technical_issues',
    'other_questions'
  )),
  answers jsonb not null
    check (
      case
        when jsonb_typeof(answers) = 'array'
          then jsonb_array_length(answers) between 1 and 4
        else false
      end
    ),
  additional_information text not null default ''
    check (char_length(additional_information) <= 2000),
  attachment_paths text[] not null default '{}'::text[]
    check (cardinality(attachment_paths) <= 3),
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'resolved')),
  created_at timestamptz not null default statement_timestamp()
);

alter table public.creator_support_requests enable row level security;
revoke all on public.creator_support_requests from public, anon, authenticated;
grant select on public.creator_support_requests to authenticated;

create policy "Creators can read their own support requests"
  on public.creator_support_requests for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Creator agreement required for support requests"
  on public.creator_support_requests as restrictive for all to authenticated
  using (public.creator_agreement_access_granted())
  with check (public.creator_agreement_access_granted());

create or replace function public.create_my_creator_support_request(
  requested_category text,
  requested_answers jsonb,
  requested_additional_information text,
  requested_attachment_paths text[]
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_reference text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not public.creator_agreement_access_granted() then
    raise exception 'Creator Agreement acceptance is required' using errcode = '42501';
  end if;
  if jsonb_typeof(requested_answers) is distinct from 'array' then
    raise exception 'Invalid creator support request' using errcode = '22023';
  end if;
  if jsonb_array_length(requested_answers) not between 1 and 4
    or exists (
      select 1
      from jsonb_array_elements(requested_answers) as entries(entry)
      where jsonb_typeof(entry) <> 'object'
        or jsonb_typeof(entry -> 'question') is distinct from 'string'
        or jsonb_typeof(entry -> 'answer') is distinct from 'string'
        or char_length(entry ->> 'question') not between 1 and 300
        or char_length(entry ->> 'answer') not between 1 and 300
    )
  then
    raise exception 'Invalid creator support request' using errcode = '22023';
  end if;
  if requested_category is null
    or requested_category not in (
    'products',
    'storefront',
    'payments_payouts',
    'account_profile',
    'plans_billing',
    'instagram_automation',
    'technical_issues',
    'other_questions'
  )
    or requested_additional_information is null
    or char_length(requested_additional_information) > 2000
    or requested_attachment_paths is null
    or cardinality(requested_attachment_paths) > 3
    or cardinality(requested_attachment_paths) <> (
      select count(distinct path)
      from unnest(requested_attachment_paths) as attachments(path)
    )
    or exists (
      select 1
      from unnest(requested_attachment_paths) as attachments(path)
      where path is null
        or path !~ (
          '^' || current_user_id::text ||
          '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
        )
    )
  then
    raise exception 'Invalid creator support request' using errcode = '22023';
  end if;

  insert into public.creator_support_requests (
    user_id,
    category,
    answers,
    additional_information,
    attachment_paths
  )
  values (
    current_user_id,
    requested_category,
    requested_answers,
    requested_additional_information,
    requested_attachment_paths
  )
  returning request_reference into created_reference;

  return created_reference;
end;
$$;

revoke all on function public.create_my_creator_support_request(
  text, jsonb, text, text[]
) from public, anon, service_role;
grant execute on function public.create_my_creator_support_request(
  text, jsonb, text, text[]
) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do nothing;

create policy "Creators can read their own support attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
