update storage.buckets
set allowed_mime_types = null
where id = 'product-files';

create or replace function public.save_storefront_product(
  requested_product_id uuid,
  requested_name text,
  requested_description text,
  requested_category text,
  requested_is_free boolean,
  requested_price_paise bigint,
  requested_cover_image_path text,
  requested_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  product public.storefront_products%rowtype;
  uploaded_path text;
  uploaded_name text;
  uploaded_size bigint;
  uploaded_mime text;
  expected_mime text;
  stored_metadata jsonb;
  account_plan text;
  free_usage bigint;
  paid_usage bigint;
  count_as_free boolean;
  count_as_paid boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  select * into product
  from public.storefront_products
  where id = requested_product_id
    and user_id = current_user_id
    and deleted_at is null
  for update;
  if not found then
    raise exception 'Product not found';
  end if;
  if requested_name is null or char_length(btrim(requested_name)) not between 1 and 100
    or requested_description is null or char_length(btrim(requested_description)) not between 1 and 5000
    or requested_category is not null and char_length(btrim(requested_category)) > 50
    or requested_is_free is null
    or requested_is_active is null
    or requested_price_paise is null or requested_price_paise < 0
    or requested_price_paise > 9007199254740991
    or (requested_is_free and requested_price_paise <> 0)
    or (not requested_is_free and requested_price_paise = 0) then
    raise exception 'Invalid product details';
  end if;
  if not exists (
    select 1 from public.creator_storefronts storefront
    where storefront.id = product.storefront_id
      and storefront.user_id = current_user_id
      and storefront.status <> 'deletion_pending'
  ) then
    raise exception 'Storefront not found';
  end if;
  if requested_cover_image_path is not null and not exists (
    select 1 from public.storefront_assets asset
    where asset.path = requested_cover_image_path
      and asset.user_id = current_user_id
      and asset.storefront_id = product.storefront_id
  ) then
    raise exception 'Invalid product cover image';
  end if;

  uploaded_path := product.file_path;
  uploaded_name := product.file_name;
  uploaded_size := product.file_size;
  uploaded_mime := product.file_mime_type;

  if product.pending_file_path is not null
    and product.pending_file_expires_at > now() then
    select metadata into stored_metadata
    from storage.objects
    where bucket_id = 'product-files'
      and name = product.pending_file_path;
    if found then
      uploaded_path := product.pending_file_path;
      uploaded_name := product.pending_file_name;
      uploaded_size := coalesce(
        nullif(stored_metadata ->> 'size', '')::bigint,
        nullif(stored_metadata ->> 'contentLength', '')::bigint
      );
      uploaded_mime := coalesce(
        nullif(stored_metadata ->> 'mimetype', ''),
        'application/octet-stream'
      );
      expected_mime := case lower(regexp_replace(uploaded_name, '^.*\.', ''))
        when 'pdf' then 'application/pdf'
        when 'mp3' then 'audio/mpeg'
        when 'doc' then 'application/msword'
        when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        when 'ppt' then 'application/vnd.ms-powerpoint'
        when 'pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        when 'xls' then 'application/vnd.ms-excel'
        when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        when 'epub' then 'application/epub+zip'
        when 'zip' then 'application/zip'
        when 'txt' then 'text/plain'
        when 'rtf' then 'application/rtf'
        when 'mp4' then 'video/mp4'
        when 'wav' then 'audio/wav'
        when 'jpg' then 'image/jpeg'
        when 'jpeg' then 'image/jpeg'
        when 'png' then 'image/png'
        when 'webp' then 'image/webp'
        else uploaded_mime
      end;
      if uploaded_size is null or uploaded_size < 1 or uploaded_size > 104857600
        or uploaded_mime is distinct from expected_mime then
        raise exception 'Invalid product file';
      end if;
    end if;
  end if;

  if uploaded_path is null then
    raise exception 'A product file is required';
  end if;
  if requested_is_active and uploaded_path is null then
    raise exception 'A product file is required before activation';
  end if;
  if uploaded_path is distinct from product.file_path and product.retired_file_path is not null then
    raise exception 'Previous product file cleanup is pending';
  end if;

  count_as_free := product.counted_as_free;
  count_as_paid := product.counted_as_paid;
  if requested_is_active
    and ((requested_is_free and not count_as_free) or (not requested_is_free and not count_as_paid)) then
    perform pg_advisory_xact_lock(hashtext(current_user_id::text), hashtext('storefront-product-limits'));
    select entitlements.plan_key into account_plan
    from public.plan_entitlements entitlements
    where entitlements.creator_id = current_user_id;

    if coalesce(account_plan, 'free') not in ('creator', 'pro_creator') then
      if requested_is_free and not count_as_free then
        select count(*) into free_usage
        from public.storefront_products
        where user_id = current_user_id and counted_as_free;
        if free_usage >= 5 then
          raise exception 'Free product listing limit reached';
        end if;
      elsif not requested_is_free and not count_as_paid then
        select count(*) into paid_usage
        from public.storefront_products
        where user_id = current_user_id and counted_as_paid;
        if paid_usage >= 1 then
          raise exception 'Paid product listing limit reached';
        end if;
      end if;
      count_as_free := count_as_free or requested_is_free;
      count_as_paid := count_as_paid or not requested_is_free;
    else
      count_as_free := count_as_free or requested_is_free;
      count_as_paid := count_as_paid or not requested_is_free;
    end if;
  end if;

  update public.storefront_products
  set name = btrim(requested_name),
      description = btrim(requested_description),
      category = nullif(btrim(coalesce(requested_category, '')), ''),
      is_free = requested_is_free,
      price_paise = requested_price_paise,
      cover_image_path = requested_cover_image_path,
      is_active = requested_is_active,
      retired_file_path = case
        when uploaded_path is distinct from product.file_path then product.file_path
        else product.retired_file_path
      end,
      file_path = uploaded_path,
      file_name = uploaded_name,
      file_size = uploaded_size,
      file_mime_type = uploaded_mime,
      pending_file_path = null,
      pending_file_name = null,
      pending_file_expires_at = null,
      first_listed_at = case
        when requested_is_active then coalesce(first_listed_at, now())
        else first_listed_at
      end,
      counted_as_free = count_as_free,
      counted_as_paid = count_as_paid
  where id = requested_product_id;
end;
$$;

revoke all on function public.save_storefront_product(uuid, text, text, text, boolean, bigint, text, boolean)
  from public, anon, authenticated;
grant execute on function public.save_storefront_product(uuid, text, text, text, boolean, bigint, text, boolean)
  to authenticated;
