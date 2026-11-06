create table public.email_subscriptions (
  email text primary key check (
    email = lower(btrim(email))
    and char_length(email) <= 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  consented_at timestamptz not null default now()
);

alter table public.email_subscriptions enable row level security;

revoke all on table public.email_subscriptions from anon, authenticated;
grant all on table public.email_subscriptions to service_role;
