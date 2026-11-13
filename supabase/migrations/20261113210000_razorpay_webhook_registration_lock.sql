alter table public.razorpay_checkout_webhooks
  add column if not exists signing_secret_hash text,
  add column if not exists events text[] not null default '{}';

create table if not exists public.razorpay_webhook_registration_locks (
  creator_id uuid not null references auth.users(id) on delete cascade,
  razorpay_account_id text not null,
  environment text not null check (environment = 'test'),
  lock_id uuid not null,
  locked_until timestamptz not null,
  primary key (creator_id, razorpay_account_id, environment)
);

alter table public.razorpay_webhook_registration_locks enable row level security;
revoke all on public.razorpay_webhook_registration_locks from anon, authenticated;
grant all on public.razorpay_webhook_registration_locks to service_role;

create or replace function public.claim_razorpay_webhook_registration(
  p_creator_id uuid,
  p_account_id text,
  p_environment text,
  p_lock_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lock_id uuid;
begin
  if p_environment <> 'test' then
    raise exception 'unsupported_razorpay_environment' using errcode = '22023';
  end if;

  insert into public.razorpay_webhook_registration_locks (
    creator_id, razorpay_account_id, environment, lock_id, locked_until
  )
  values (
    p_creator_id, p_account_id, p_environment, p_lock_id, now() + interval '90 seconds'
  )
  on conflict (creator_id, razorpay_account_id, environment)
  do update
     set lock_id = excluded.lock_id,
         locked_until = excluded.locked_until
   where public.razorpay_webhook_registration_locks.locked_until < now()
  returning lock_id into v_lock_id;

  return found and v_lock_id = p_lock_id;
end;
$$;

revoke all on function public.claim_razorpay_webhook_registration(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_razorpay_webhook_registration(uuid, text, text, uuid)
  to service_role;

create or replace function public.release_razorpay_webhook_registration(
  p_creator_id uuid,
  p_account_id text,
  p_environment text,
  p_lock_id uuid
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.razorpay_webhook_registration_locks
   where creator_id = p_creator_id
     and razorpay_account_id = p_account_id
     and environment = p_environment
     and lock_id = p_lock_id;
$$;

revoke all on function public.release_razorpay_webhook_registration(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.release_razorpay_webhook_registration(uuid, text, text, uuid)
  to service_role;
