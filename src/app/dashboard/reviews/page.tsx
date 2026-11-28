import type { Metadata } from "next";
import { CreatorReviews, type CreatorReview } from "@/components/reviews/creator-reviews";
import { requireCreatorContext } from "@/lib/account/server";

export const metadata: Metadata = {
  title: "Reviews | CloverLoop creator dashboard",
  robots: { index: false, follow: false },
};

type ReviewRow = {
  id: string;
  product_id: string;
  reviewer_name: string;
  rating: number;
  body: string;
  status: "published" | "hidden";
  submitted_at: string;
};

const notices: Record<string, string> = {
  sent: "Thanks. The CloverLoop team will review your report.",
  invalid: "Choose a reason before sending a report.",
  failed: "Your report could not be sent. Please try again.",
};

export default async function CreatorReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string | string[] }>;
}) {
  const { report } = await searchParams;
  const reportStatus = Array.isArray(report) ? report[0] : report;
  const { supabase, user } = await requireCreatorContext();

  const { data: reviewData, error: reviewError } = await supabase
    .from("product_reviews")
    .select("id,product_id,reviewer_name,rating,body,status,submitted_at")
    .eq("creator_id", user.id)
    .order("submitted_at", { ascending: false })
    .limit(300);
  if (reviewError) {
    console.error("Could not load creator product reviews.", { code: reviewError.code });
    throw new Error("Your reviews could not be loaded. Please try again.");
  }
  const rows = (reviewData ?? []) as ReviewRow[];
  const productIds = [...new Set(rows.map((row) => row.product_id))];
  const reviewIds = rows.map((row) => row.id);

  const [productsResponse, storefrontResponse, reportsResponse] = await Promise.all([
    productIds.length
      ? supabase.from("storefront_products").select("id,name,is_active,deleted_at").in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("creator_storefronts").select("username,status").eq("user_id", user.id).maybeSingle(),
    reviewIds.length
      ? supabase.from("product_review_reports").select("review_id,status").in("review_id", reviewIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (productsResponse.error || storefrontResponse.error || reportsResponse.error) {
    console.error("Could not load review details.", {
      code: productsResponse.error?.code ?? storefrontResponse.error?.code ?? reportsResponse.error?.code,
    });
    throw new Error("Your reviews could not be loaded. Please try again.");
  }

  const storefront = storefrontResponse.data;
  const products = new Map(
    (productsResponse.data ?? []).map((product) => [
      product.id as string,
      product as { id: string; name: string; is_active: boolean; deleted_at: string | null },
    ]),
  );
  const reports = new Map(
    (reportsResponse.data ?? []).map((row) => [row.review_id as string, row.status as CreatorReview["reportStatus"]]),
  );

  const reviews: CreatorReview[] = rows.map((row) => {
    const product = products.get(row.product_id);
    const productIsLive = Boolean(
      product && product.is_active && !product.deleted_at && storefront?.status === "published" && storefront.username,
    );
    return {
      id: row.id,
      productId: row.product_id,
      productName: product?.name ?? "Deleted product",
      productUrl: productIsLive ? `/${encodeURIComponent(storefront!.username)}/product/${row.product_id}` : null,
      reviewerName: row.reviewer_name,
      rating: row.rating,
      body: row.body,
      status: row.status,
      submittedAt: row.submitted_at,
      reportStatus: reports.get(row.id) ?? null,
    };
  });

  return <CreatorReviews reviews={reviews} notice={reportStatus ? notices[reportStatus] : undefined} />;
}
