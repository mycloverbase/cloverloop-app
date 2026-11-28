import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashReviewToken, isReviewTokenFormat } from "@/lib/reviews/tokens";
import { readJsonObject, reviewJsonResponse } from "@/lib/reviews/api";
import { defaultReviewerName } from "@/lib/reviews/validation";

export const runtime = "nodejs";

type InvitationRow = {
  state: string;
  product_name: string;
  product_description: string;
  product_cover_image_path: string | null;
  product_id: string;
  storefront_username: string;
  creator_name: string;
  customer_name: string | null;
  storefront_published: boolean;
};

function isInvitationRow(value: unknown): value is InvitationRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.state === "string" &&
    typeof row.product_name === "string" &&
    typeof row.product_id === "string" &&
    typeof row.storefront_username === "string" &&
    typeof row.creator_name === "string";
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body || !isReviewTokenFormat(body.token)) {
    return reviewJsonResponse({ state: "invalid", error: "This review link is invalid." }, 400);
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return reviewJsonResponse({ error: "Reviews are temporarily unavailable." }, 503);

  const { data, error } = await admin.rpc("get_product_review_invitation", {
    p_token_hash: hashReviewToken(body.token),
  });
  if (error) {
    console.error("Review invitation could not be loaded.", { code: error.code });
    return reviewJsonResponse({ error: "Reviews are temporarily unavailable." }, 503);
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!isInvitationRow(row)) {
    return reviewJsonResponse({ state: "invalid", error: "This review link is invalid." }, 404);
  }

  const coverImageUrl = row.product_cover_image_path
    ? admin.storage.from("storefront-assets").getPublicUrl(row.product_cover_image_path).data.publicUrl
    : null;
  const productUrl = row.storefront_published
    ? `/${encodeURIComponent(row.storefront_username)}/product/${row.product_id}`
    : null;

  return reviewJsonResponse({
    state: row.state,
    product: {
      name: row.product_name,
      description: row.product_description.slice(0, 240),
      coverImageUrl,
      url: productUrl,
    },
    creatorName: row.creator_name,
    suggestedName: defaultReviewerName(row.customer_name),
  });
}
