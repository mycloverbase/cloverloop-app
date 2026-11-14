import { NextResponse } from "next/server";
import { sendFreeProductEmail } from "@/lib/free-products/email";
import {
  checkFreeProductRateLimit,
  generateDownloadToken,
  getFreeProductConfig,
  getRequestIp,
  isUuid,
  noStoreHeaders,
  normalizeCustomerEmail,
} from "@/lib/free-products/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const usernamePattern = /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/;

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: noStoreHeaders() });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return jsonError("Please check the claim details and try again.", 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonError("Please check the claim details and try again.", 400);
  }

  const email = normalizeCustomerEmail(body.email);
  const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
  const productId = body.productId;
  const storefrontUsername = typeof body.storefrontUsername === "string"
    ? body.storefrontUsername.trim().toLowerCase()
    : "";
  if (!email) return jsonError("Enter a valid email address.", 400);
  if (!customerName || customerName.length > 120) {
    return jsonError("Enter your full name.", 400);
  }
  if (!isUuid(productId) || !usernamePattern.test(storefrontUsername)) {
    return jsonError("This product is no longer available.", 404);
  }
  if (body.termsAccepted !== true) {
    return jsonError("Accept the Terms of Use and Privacy Policy to continue.", 400);
  }

  const config = getFreeProductConfig();
  const supabase = createSupabaseAdminClient();
  if (!config || !supabase) {
    return jsonError("Free product delivery is temporarily unavailable. Please try again later.", 503);
  }

  const clientIp = getRequestIp(request);
  let withinRateLimit: boolean;
  try {
    withinRateLimit = await checkFreeProductRateLimit(supabase, [
      { key: `claim-ip:${clientIp}`, maxRequests: 10 },
      { key: `claim-email:${email}`, maxRequests: 3 },
    ]);
  } catch (error) {
    console.error("Could not check the free product claim rate limit.", error);
    return jsonError("Free product delivery is temporarily unavailable. Please try again later.", 503);
  }
  if (!withinRateLimit) {
    return jsonError("Too many claim requests. Please try again in about an hour.", 429);
  }

  const { token, tokenHash } = generateDownloadToken();
  const now = new Date();
  const tokenExpiresAt = new Date(now.getTime() + config.linkExpiryHours * 60 * 60 * 1000);
  const { data, error } = await supabase.rpc("claim_free_product", {
    requested_product_id: productId,
    requested_storefront_username: storefrontUsername,
    requested_customer_email: email,
    requested_claim_token_hash: tokenHash,
    requested_token_expires_at: tokenExpiresAt.toISOString(),
    requested_terms_accepted_at: now.toISOString(),
    requested_max_downloads: config.maxDownloads,
  });
  if (error) {
    if (error.message.includes("Download limit reached")) {
      return jsonError("This product has reached its download limit for this email address.", 409);
    }
    console.error("Could not create a free product claim.", error);
    return jsonError("This product is no longer available to claim.", 409);
  }

  const claim = Array.isArray(data) ? data[0] : data;
  if (
    typeof claim !== "object" ||
    claim === null ||
    typeof claim.claim_id !== "string" ||
    typeof claim.product_name !== "string" ||
    typeof claim.creator_name !== "string" ||
    typeof claim.disposition !== "string"
  ) {
    console.error("The free product claim response was invalid.");
    return jsonError("Free product delivery is temporarily unavailable. Please try again later.", 503);
  }

  if (claim.disposition === "already_sent") {
    return NextResponse.json(
      { ok: true, emailSent: false, reused: true },
      { headers: noStoreHeaders() },
    );
  }
  if (claim.disposition === "processing") {
    return jsonError("Your request is being processed. Check your inbox shortly before trying again.", 409);
  }

  if (claim.disposition !== "send_email") {
    console.error("The free product claim returned an unknown disposition.");
    return jsonError("Free product delivery is temporarily unavailable. Please try again later.", 503);
  }

  const { data: namedClaim, error: nameError } = await supabase
    .from("product_claims")
    .update({ customer_name: customerName })
    .eq("id", claim.claim_id)
    .eq("claim_token_hash", tokenHash)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (nameError || !namedClaim) {
    console.error("Could not save the free product claimant name.", { code: nameError?.code ?? "not_found" });
    const { error: statusError } = await supabase.rpc("mark_free_product_claim_email_failed", {
      requested_claim_id: claim.claim_id,
      requested_claim_token_hash: tokenHash,
    });
    if (statusError) console.error("Could not record a failed free product email attempt.", statusError);
    return jsonError("Free product delivery is temporarily unavailable. Please try again later.", 503);
  }

  const emailAccepted = await sendFreeProductEmail({
    email,
    customerName,
    creatorName: claim.creator_name,
    productName: claim.product_name,
    token,
    expiryHours: config.linkExpiryHours,
  });
  if (!emailAccepted) {
    const { error: statusError } = await supabase.rpc("mark_free_product_claim_email_failed", {
      requested_claim_id: claim.claim_id,
      requested_claim_token_hash: tokenHash,
    });
    if (statusError) console.error("Could not record a failed free product email attempt.", statusError);
    return jsonError("We couldn't send the download email. Please submit the claim again to retry.", 502);
  }

  const { data: markedSent, error: markError } = await supabase.rpc("mark_free_product_claim_email_sent", {
    requested_claim_id: claim.claim_id,
    requested_claim_token_hash: tokenHash,
  });
  if (markError || markedSent !== true) {
    if (markError) console.error("Could not confirm free product email acceptance.", markError);
    else console.error("The free product claim could not be marked as emailed.");
    return jsonError("We couldn't confirm email delivery. Please submit the claim again to retry.", 502);
  }

  return NextResponse.json(
    { ok: true, emailSent: true, reused: false },
    { headers: noStoreHeaders() },
  );
}
