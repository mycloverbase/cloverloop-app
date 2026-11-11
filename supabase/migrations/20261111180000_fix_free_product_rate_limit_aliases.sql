create or replace function public.check_free_product_rate_limit(
  requested_keys text[],
  requested_limits integer[],
  requested_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  key_index integer;
  bucket_start timestamptz;
  attempts integer;
begin
  if cardinality(requested_keys) = 0
    or cardinality(requested_keys) <> cardinality(requested_limits)
    or cardinality(requested_keys) > 4
    or requested_window_seconds not between 60 and 86400
    or exists (
      select 1 from unnest(requested_keys) as supplied_keys(key_value)
      where key_value !~ '^[0-9a-f]{64}$'
    )
    or exists (
      select 1 from unnest(requested_limits) as supplied_limits(limit_value)
      where limit_value not between 1 and 1000
    ) then
    raise exception 'Invalid rate limit request';
  end if;

  bucket_start := to_timestamp(
    floor(extract(epoch from now()) / requested_window_seconds) * requested_window_seconds
  );

  delete from public.free_product_rate_limits
  where window_started_at < now() - interval '48 hours';

  for key_index in 1..cardinality(requested_keys) loop
    perform pg_advisory_xact_lock(hashtext(requested_keys[key_index]));
    insert into public.free_product_rate_limits (key_hash, window_started_at, request_count)
    values (requested_keys[key_index], bucket_start, 1)
    on conflict (key_hash, window_started_at) do update
      set request_count = public.free_product_rate_limits.request_count + 1
    returning request_count into attempts;

    if attempts > requested_limits[key_index] then
      return false;
    end if;
  end loop;

  return true;
end;
$$;
