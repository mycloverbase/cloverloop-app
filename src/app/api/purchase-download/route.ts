import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  hashCheckoutToken,
  isValidCheckoutToken,
} from "@/lib/razorpay/checkout";

type PurchaseEntitlement = {
  id: string;
  order_id: string;
  creator_id: string;
  storefront_id: string;
  product_id: string;
  expires_at: string;
  download_count: number;
  max_downloads: number;
  status: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) return jsonResponse({ error: "Download is unavailable." }, 503);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonResponse({ error: "Invalid download request." }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid download request." }, 400);
  }

  const token = body.checkoutToken;
  if (!isValidCheckoutToken(token)) {
    return jsonResponse({ error: "This download link is invalid or expired." }, 400);
  }
  const tokenHash = hashCheckoutToken(token);

  const { data: entitlementData, error: entitlementError } = await admin
    .from("product_purchase_entitlements")
    .select(
      "id,order_id,creator_id,storefront_id,product_id,expires_at,download_count,max_downloads,status",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (entitlementError) {
    console.error("Paid product entitlement could not be loaded.");
    return jsonResponse({ error: "Download is temporarily unavailable." }, 503);
  }
  if (!entitlementData) {
    return jsonResponse({ error: "This download link is invalid or expired." }, 404);
  }
  const entitlement = entitlementData as PurchaseEntitlement;
  if (
    entitlement.status !== "active" ||
    new Date(entitlement.expires_at).getTime() <= Date.now() ||
    entitlement.download_count >= entitlement.max_downloads
  ) {
    return jsonResponse({ error: "This download link is expired or has reached its limit." }, 410);
  }

  const { data: order, error: orderError } = await admin
    .from("razorpay_checkout_orders")
    .select("order_status,fulfillment_status")
    .eq("id", entitlement.order_id)
    .eq("creator_id", entitlement.creator_id)
    .eq("product_id", entitlement.product_id)
    .maybeSingle();

  if (orderError) {
    console.error("Paid product order could not be loaded.");
    return jsonResponse({ error: "Download is temporarily unavailable." }, 503);
  }
  if (
    !order ||
    order.order_status !== "paid" ||
    order.fulfillment_status !== "ready"
  ) {
    return jsonResponse({ error: "This purchase is not available for download." }, 403);
  }

  const { data: product, error: productError } = await admin
    .from("storefront_products")
    .select("id,storefront_id,user_id,is_active,file_path,file_name,deleted_at")
    .eq("id", entitlement.product_id)
    .eq("storefront_id", entitlement.storefront_id)
    .eq("user_id", entitlement.creator_id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (productError) {
    console.error("Paid product file metadata could not be loaded.");
    return jsonResponse({ error: "Download is temporarily unavailable." }, 503);
  }
  if (
    !product ||
    typeof product.file_path !== "string" ||
    !product.file_path
  ) {
    return jsonResponse({ error: "This product is no longer available for download." }, 403);
  }

  const { data: storefront, error: storefrontError } = await admin
    .from("creator_storefronts")
    .select("id,status,deleted_at")
    .eq("id", entitlement.storefront_id)
    .eq("user_id", entitlement.creator_id)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();

  if (storefrontError) {
    console.error("Paid product storefront could not be checked.");
    return jsonResponse({ error: "Download is temporarily unavailable." }, 503);
  }
  if (!storefront) {
    return jsonResponse({ error: "This product is no longer available for download." }, 403);
  }

  const { data: signedFile, error: signedFileError } = await admin.storage
    .from("product-files")
    .createSignedUrl(product.file_path, 60, {
      download: product.file_name || true,
    });

  if (signedFileError || !signedFile?.signedUrl) {
    console.error("Paid product download URL could not be created.");
    return jsonResponse({ error: "Unable to prepare the download. Please retry." }, 503);
  }

  const { error: recordError } = await admin.rpc("record_paid_product_download", {
    p_token_hash: tokenHash,
  });
  if (recordError) {
    if (recordError.message.includes("purchase_download_not_available")) {
      return jsonResponse(
        { error: "This download link is expired or has reached its limit." },
        410,
      );
    }
    console.error("Paid product download count could not be recorded.");
    return jsonResponse({ error: "Download is temporarily unavailable." }, 503);
  }

  return jsonResponse({ downloadUrl: signedFile.signedUrl });
}
