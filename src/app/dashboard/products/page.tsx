import type { Metadata } from "next";
import { ProductManager } from "@/components/storefront/product-manager";
import { requireCreatorContext } from "@/lib/account/server";
import { getMyPlanEntitlements } from "@/lib/account/entitlements";
import { getCreatorStorefront } from "@/lib/storefront/server";

export const metadata: Metadata = {
  title: "Products | CloverLoop creator dashboard",
  robots: { index: false, follow: false },
};

type ClaimStat = {
  product_id: string;
  product_name: string;
  claim_count: number | string;
  successful_download_count: number | string;
};

type RecentClaim = {
  id: string;
  product_id: string;
  customer_email: string;
  status: string;
  download_count: number;
  created_at: string;
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
  const [
    storefront,
    freeListingCount,
    paidListingCount,
    claimStatsResponse,
    recentClaimsResponse,
    entitlements,
  ] = await Promise.all([
    getCreatorStorefront(supabase, user.id),
    getListingCount(supabase, user.id, "counted_as_free"),
    getListingCount(supabase, user.id, "counted_as_paid"),
    supabase.rpc("get_my_free_product_claim_stats"),
    supabase
      .from("product_claims")
      .select("id,product_id,customer_email,status,download_count,created_at")
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    getMyPlanEntitlements(supabase),
  ]);
  if (claimStatsResponse.error) {
    console.error("Could not load creator Lead Magnet claim statistics.", claimStatsResponse.error);
    throw new Error("Your Lead Magnet claim statistics could not be loaded. Please try again.");
  }
  if (recentClaimsResponse.error) {
    console.error("Could not load recent creator Lead Magnet claims.", recentClaimsResponse.error);
    throw new Error("Your recent Lead Magnet claims could not be loaded. Please try again.");
  }
  const claimStats = (claimStatsResponse.data ?? []) as ClaimStat[];
  const productNames = new Map(claimStats.map((row) => [row.product_id, row.product_name]));
  const recentClaims = (recentClaimsResponse.data ?? []) as RecentClaim[];

  return (
    <div className="dashboard-page-content">
      <ProductManager
        storefrontId={storefront?.id ?? null}
        storefrontUsername={storefront?.username ?? null}
        storefrontStatus={storefront?.status ?? null}
        initialProducts={storefront?.products ?? []}
        plan={entitlements.plan}
        initialFreeListingCount={freeListingCount}
        initialPaidListingCount={paidListingCount}
      />
      <section className="free-product-claims-section" aria-labelledby="free-product-claims-title">
        <div>
          <span className="dashboard-card-label">Lead Magnets</span>
          <h2 id="free-product-claims-title">Claims and downloads</h2>
        </div>
        {claimStats.length ? (
          <div className="free-product-claims-stats">
            {claimStats.map((stat) => (
              <article className="free-product-claims-stat" key={stat.product_id}>
                <h3>{stat.product_name}</h3>
                <p>{Number(stat.claim_count)} claims</p>
                <p>{Number(stat.successful_download_count)} successful downloads</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="product-manager-note">Lead Magnet claims will appear here when customers claim an available product.</p>
        )}
        {recentClaims.length ? (
          <div className="free-product-claim-list" aria-label="Recent Lead Magnet claims">
            {recentClaims.map((claim) => (
              <article className="free-product-claim-row" key={claim.id}>
                <div>
                  <strong>{productNames.get(claim.product_id) ?? "Lead Magnet"}</strong>
                  <p>{claim.customer_email}</p>
                </div>
                <span>
                  {new Date(claim.created_at).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  })}
                  <br />
                  {claim.download_count} downloads
                </span>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
