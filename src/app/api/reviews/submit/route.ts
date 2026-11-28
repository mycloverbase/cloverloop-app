import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashReviewToken, isReviewTokenFormat } from "@/lib/reviews/tokens";
import { readJsonObject, reviewJsonResponse, reviewTokenErrors } from "@/lib/reviews/api";
import { validateReviewInput } from "@/lib/reviews/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body || !isReviewTokenFormat(body.token)) {
    return reviewJsonResponse({ state: "invalid", error: reviewTokenErrors.RVINV.error }, 400);
  }
  const validation = validateReviewInput(body);
  if (!validation.ok) return reviewJsonResponse({ error: validation.error }, 400);

  const admin = createSupabaseAdminClient();
  if (!admin) return reviewJsonResponse({ error: "Reviews are temporarily unavailable." }, 503);

  const tokenHash = hashReviewToken(body.token);
  const { data, error } = await admin.rpc("submit_product_review", {
    p_token_hash: tokenHash,
    p_rating: validation.review.rating,
    p_body: validation.review.body,
    p_reviewer_name: validation.review.reviewerName,
  });
  if (error) {
    const known = reviewTokenErrors[error.code ?? ""];
    if (known) return reviewJsonResponse({ state: known.state, error: known.error }, known.status);
    if (error.code === "22023") {
      return reviewJsonResponse({ error: "Check your rating, review and display name, then try again." }, 400);
    }
    console.error("Product review could not be submitted.", { code: error.code });
    return reviewJsonResponse({ error: "Your review could not be saved. Please try again." }, 503);
  }
  if (typeof data !== "string") {
    console.error("Product review submission returned an invalid response.");
    return reviewJsonResponse({ error: "Your review could not be saved. Please try again." }, 503);
  }

  const { data: invitation } = await admin.rpc("get_product_review_invitation", { p_token_hash: tokenHash });
  const row = Array.isArray(invitation) ? invitation[0] : null;
  let productUrl: string | null = null;
  if (
    row && typeof row === "object" && row.storefront_published === true &&
    typeof row.storefront_username === "string" && typeof row.product_id === "string"
  ) {
    productUrl = `/${encodeURIComponent(row.storefront_username)}/product/${row.product_id}`;
    revalidatePath(productUrl);
  }
  return reviewJsonResponse({ ok: true, productUrl });
}
