import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  hashCheckoutToken,
  isValidCheckoutToken,
} from "@/lib/razorpay/checkout";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) return jsonResponse({ error: "Purchase status is unavailable." }, 503);

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  const token = request.headers.get("x-checkout-token");
  if (
    !orderId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      orderId,
    ) ||
    !isValidCheckoutToken(token)
  ) {
    return jsonResponse({ error: "Invalid purchase status request." }, 400);
  }

  const { data: order, error } = await admin
    .from("razorpay_checkout_orders")
    .select("order_status,payment_status,fulfillment_status")
    .eq("id", orderId)
    .eq("checkout_token_hash", hashCheckoutToken(token))
    .maybeSingle();

  if (error) {
    console.error("Razorpay checkout status could not be loaded.");
    return jsonResponse({ error: "Purchase status is temporarily unavailable." }, 503);
  }
  if (!order) {
    return jsonResponse({ error: "Purchase status could not be found." }, 404);
  }

  const { data: purchaseEmail, error: emailError } = await admin
    .from("razorpay_purchase_emails")
    .select("status")
    .eq("order_id", orderId)
    .maybeSingle();
  if (emailError) {
    console.error("Razorpay purchase email status could not be loaded.");
    return jsonResponse({ error: "Purchase status is temporarily unavailable." }, 503);
  }

  return jsonResponse({
    orderStatus: order.order_status,
    paymentStatus: order.payment_status,
    fulfillmentStatus: order.fulfillment_status,
    purchaseEmailStatus: purchaseEmail?.status ?? "pending",
  });
}
