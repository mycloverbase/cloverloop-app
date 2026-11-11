import { NextResponse } from "next/server";
import { hashDownloadToken } from "@/lib/free-products/server";
import {
  checkFreeProductRateLimit,
  getFreeProductConfig,
  getRequestIp,
  noStoreHeaders,
} from "@/lib/free-products/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: noStoreHeaders() });
}

export async function POST(request: Request) {
  const config = getFreeProductConfig();
  const supabase = createSupabaseAdminClient();
  if (!config || !supabase) {
    return jsonError("This download is temporarily unavailable. Please try again later.", 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("This download link is invalid or has expired.", 404);
  }
  const token = typeof body === "object" && body !== null && "token" in body
    ? body.token
    : null;
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return jsonError("This download link is invalid or has expired.", 404);
  }

  try {
    const allowed = await checkFreeProductRateLimit(supabase, [
      { key: `download-ip:${getRequestIp(request)}`, maxRequests: 60 },
    ]);
    if (!allowed) return jsonError("Too many download attempts. Please try again later.", 429);
  } catch {
    return jsonError("This download is temporarily unavailable. Please try again later.", 503);
  }

  const tokenHash = hashDownloadToken(token);
  const { data: claim, error: claimError } = await supabase
    .from("product_claims")
    .select("id,product_id,storefront_id,creator_id,status,token_expires_at,download_count,max_downloads")
    .eq("claim_token_hash", tokenHash)
    .maybeSingle();
  if (claimError) {
    console.error("Could not look up a free product download claim.", claimError);
    return jsonError("This download is temporarily unavailable. Please try again later.", 503);
  }
  if (!claim) return jsonError("This download link is invalid or has expired.", 404);

  if (new Date(claim.token_expires_at).getTime() <= Date.now()) {
    if (claim.status === "email_sent" || claim.status === "downloaded") {
      const { error } = await supabase
        .from("product_claims")
        .update({ status: "expired" })
        .eq("id", claim.id)
        .eq("claim_token_hash", tokenHash);
      if (error) console.error("Could not mark an expired free product claim.", error);
    }
    return jsonError("This download link has expired. Request a new link from the product storefront.", 410);
  }
  if (
    (claim.status !== "email_sent" && claim.status !== "downloaded") ||
    claim.download_count >= claim.max_downloads
  ) {
    return jsonError(
      claim.download_count >= claim.max_downloads
        ? "This download link has reached its download limit."
        : "This download link is invalid or has expired.",
      410,
    );
  }

  const { data: product, error: productError } = await supabase
    .from("storefront_products")
    .select("id,storefront_id,user_id,is_free,price_paise,is_active,file_path,file_name,deleted_at")
    .eq("id", claim.product_id)
    .eq("storefront_id", claim.storefront_id)
    .eq("user_id", claim.creator_id)
    .maybeSingle();
  if (productError) {
    console.error("Could not verify a free product download.", productError);
    return jsonError("This download is temporarily unavailable. Please try again later.", 503);
  }
  if (
    !product ||
    !product.is_free ||
    product.price_paise !== 0 ||
    !product.is_active ||
    product.deleted_at !== null ||
    typeof product.file_path !== "string" ||
    typeof product.file_name !== "string"
  ) {
    return jsonError("This product is no longer available to download.", 410);
  }

  const { data: storefront, error: storefrontError } = await supabase
    .from("creator_storefronts")
    .select("id,status,deleted_at")
    .eq("id", product.storefront_id)
    .eq("user_id", claim.creator_id)
    .maybeSingle();
  if (storefrontError) {
    console.error("Could not verify the free product storefront status.", storefrontError);
    return jsonError("This download is temporarily unavailable. Please try again later.", 503);
  }
  if (!storefront || storefront.status !== "published" || storefront.deleted_at !== null) {
    return jsonError("This product is no longer available to download.", 410);
  }

  const { data: signedFile, error: signedFileError } = await supabase.storage
    .from("product-files")
    .createSignedUrl(product.file_path, 60, { download: product.file_name });
  if (signedFileError || !signedFile?.signedUrl) {
    if (signedFileError) console.error("Could not create a short-lived free product download URL.", signedFileError);
    return jsonError("This product file is temporarily unavailable. Please try again later.", 503);
  }

  const { data: recorded, error: recordError } = await supabase.rpc("record_free_product_download", {
    requested_claim_token_hash: tokenHash,
    requested_file_path: product.file_path,
  });
  if (recordError) {
    console.error("Could not record a free product download.", recordError);
    return jsonError("This download is temporarily unavailable. Please try again later.", 503);
  }
  if (recorded !== true) {
    return jsonError("This download link has expired or reached its download limit.", 410);
  }

  return NextResponse.json(
    { ok: true, url: signedFile.signedUrl },
    { headers: noStoreHeaders() },
  );
}
