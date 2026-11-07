import type { Metadata } from "next";
import { ProductManager } from "@/components/storefront/product-manager";
import { getCreatorPlan } from "@/lib/account/plans";
import { requireCreatorContext } from "@/lib/account/server";
import { getCreatorStorefront } from "@/lib/storefront/server";

export const metadata: Metadata = {
  title: "Products | CloverLoop creator dashboard",
  robots: { index: false, follow: false },
};

async function getListingCount(
  supabase: Awaited<ReturnType<typeof requireCreatorContext>>["supabase"],
  userId: string,
  column: "counted_as_free" | "counted_as_paid",
) {
  const { count, error } = await supabase
    .from("storefront_products")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq(column, true);
  if (error) {
    console.error("Could not load lifetime product listing usage.", error);
    throw new Error("Your product listing usage could not be loaded. Please try again.");
  }
  return count ?? 0;
}

export default async function CreatorProductsPage() {
  const { supabase, user } = await requireCreatorContext();
  const [storefront, freeListingCount, paidListingCount] = await Promise.all([
    getCreatorStorefront(supabase, user.id),
    getListingCount(supabase, user.id, "counted_as_free"),
    getListingCount(supabase, user.id, "counted_as_paid"),
  ]);

  return (
    <div className="dashboard-page-content">
      <ProductManager
        storefrontId={storefront?.id ?? null}
        storefrontUsername={storefront?.username ?? null}
        storefrontStatus={storefront?.status ?? null}
        initialProducts={storefront?.products ?? []}
        plan={getCreatorPlan(user.app_metadata?.plan)}
        initialFreeListingCount={freeListingCount}
        initialPaidListingCount={paidListingCount}
      />
    </div>
  );
}
