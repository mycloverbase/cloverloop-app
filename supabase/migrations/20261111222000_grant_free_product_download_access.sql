grant select on public.product_claims, public.storefront_products, public.creator_storefronts
  to service_role;
grant update (status) on public.product_claims to service_role;
