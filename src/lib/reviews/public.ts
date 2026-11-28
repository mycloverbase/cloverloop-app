import type { createSupabasePublicClient } from "@/lib/supabase/public";

type PublicClient = NonNullable<ReturnType<typeof createSupabasePublicClient>>;

export type ProductReviewSummary = {
  reviewCount: number;
  averageRating: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
};

export type PublicProductReview = {
  id: string;
  reviewerName: string;
  rating: number;
  body: string;
  submittedAt: string;
  verifiedPurchase: boolean;
};

export const PRODUCT_REVIEW_PAGE_SIZE = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function parseReviewSummary(value: unknown): ProductReviewSummary | null {
  if (!isRecord(value)) return null;
  const reviewCount = count(value.review_count);
  const average = Number(value.average_rating);
  if (!reviewCount || !Number.isFinite(average) || average < 1 || average > 5) return null;
  return {
    reviewCount,
    averageRating: Math.round(average * 10) / 10,
    distribution: {
      5: count(value.rating_5),
      4: count(value.rating_4),
      3: count(value.rating_3),
      2: count(value.rating_2),
      1: count(value.rating_1),
    },
  };
}

export function parsePublicReview(value: unknown): PublicProductReview | null {
  if (!isRecord(value)) return null;
  const { id, reviewer_name: reviewerName, rating, body, submitted_at: submittedAt } = value;
  if (
    typeof id !== "string" ||
    typeof reviewerName !== "string" ||
    typeof rating !== "number" ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    typeof body !== "string" ||
    typeof submittedAt !== "string" ||
    !Number.isFinite(new Date(submittedAt).getTime())
  ) return null;
  return {
    id,
    reviewerName,
    rating,
    body,
    submittedAt,
    verifiedPurchase: value.verified_purchase === true,
  };
}

export async function getPublishedProductReviews(
  supabase: PublicClient,
  productId: string,
): Promise<{ summary: ProductReviewSummary | null; reviews: PublicProductReview[] }> {
  const [summaryResponse, reviewsResponse] = await Promise.all([
    supabase
      .from("product_review_summaries")
      .select("review_count,average_rating,rating_5,rating_4,rating_3,rating_2,rating_1")
      .eq("product_id", productId)
      .maybeSingle(),
    supabase
      .from("published_product_reviews")
      .select("id,reviewer_name,rating,body,submitted_at,verified_purchase")
      .eq("product_id", productId)
      .order("submitted_at", { ascending: false })
      .limit(PRODUCT_REVIEW_PAGE_SIZE),
  ]);
  if (summaryResponse.error || reviewsResponse.error) {
    // Reviews are supplementary: never block the product page or checkout on them.
    console.error("Product reviews could not be loaded.", {
      code: summaryResponse.error?.code ?? reviewsResponse.error?.code,
    });
    return { summary: null, reviews: [] };
  }
  return {
    summary: parseReviewSummary(summaryResponse.data),
    reviews: (reviewsResponse.data ?? [])
      .map(parsePublicReview)
      .filter((review): review is PublicProductReview => review !== null),
  };
}
