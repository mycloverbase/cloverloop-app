import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isRazorpayPartnerWebhookFulfillmentEnabled } from "@/lib/razorpay/checkout";
import { processRazorpayPartnerWebhookQueue } from "@/lib/razorpay/webhook-fulfillment";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }
  if (!isRazorpayPartnerWebhookFulfillmentEnabled()) {
    return jsonResponse(
      { error: "Razorpay Test Mode webhook fulfillment is not configured." },
      503,
    );
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return jsonResponse({ error: "Webhook processing is unavailable." }, 503);
  }

  const results = await processRazorpayPartnerWebhookQueue(admin, null, 5);
  return jsonResponse(results);
}
