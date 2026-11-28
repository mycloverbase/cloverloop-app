import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRazorpayOAuthMode } from "@/lib/razorpay/oauth";
import {
  isReviewInvitationDeliveryEnabled,
  processReviewInvitationQueue,
} from "@/lib/reviews/invitation-email";

export const runtime = "nodejs";
export const maxDuration = 120;

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
  if (!isReviewInvitationDeliveryEnabled()) {
    return jsonResponse({ skipped: true, reason: "Review invitations are disabled or not configured." });
  }
  const environment = getRazorpayOAuthMode();
  if (!environment) {
    return jsonResponse({ error: "RAZORPAY_OAUTH_MODE must be test or live." }, 503);
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return jsonResponse({ error: "Review invitation processing is unavailable." }, 503);
  }

  const reviewInvitations = await processReviewInvitationQueue(admin, environment);
  return jsonResponse({ environment, reviewInvitations });
}
