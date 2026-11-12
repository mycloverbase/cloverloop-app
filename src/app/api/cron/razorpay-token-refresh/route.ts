import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  decryptRazorpayToken,
  getRazorpayOAuthConfig,
  RazorpayOAuthError,
  refreshRazorpayTokenPair,
  encryptRazorpayToken,
  type RazorpayOAuthConfig,
} from "@/lib/razorpay/oauth";

export const runtime = "nodejs";

type RefreshClaim = {
  creator_id: string;
  environment: string;
  encrypted_refresh_token: string;
  lock_token: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

function parseRefreshClaim(value: unknown): RefreshClaim | null {
  if (
    !isRecord(value) ||
    typeof value.creator_id !== "string" ||
    typeof value.environment !== "string" ||
    typeof value.encrypted_refresh_token !== "string" ||
    typeof value.lock_token !== "string"
  ) return null;
  return {
    creator_id: value.creator_id,
    environment: value.environment,
    encrypted_refresh_token: value.encrypted_refresh_token,
    lock_token: value.lock_token,
  };
}

async function refreshClaim(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  claim: RefreshClaim,
  config: RazorpayOAuthConfig,
): Promise<"refreshed" | "failed" | "reconnect_required"> {
  if (claim.environment !== config.environment) {
    console.error("A Razorpay token refresh claim had a mismatched environment.");
    return "failed";
  }

  try {
    const currentRefreshToken = decryptRazorpayToken(
      claim.encrypted_refresh_token,
      claim.creator_id,
      "refresh",
    );
    const tokens = await refreshRazorpayTokenPair(currentRefreshToken, config);
    const now = Date.now();
    const { data: completed, error: completeError } = await admin.rpc("finish_razorpay_token_refresh", {
      requested_creator_id: claim.creator_id,
      requested_lock_token: claim.lock_token,
      requested_public_token: tokens.publicToken,
      requested_access_token_encrypted: encryptRazorpayToken(tokens.accessToken, claim.creator_id, "access"),
      requested_refresh_token_encrypted: encryptRazorpayToken(tokens.refreshToken, claim.creator_id, "refresh"),
      requested_token_expires_at: new Date(now + tokens.expiresInSeconds * 1000).toISOString(),
      requested_refresh_token_expires_at: new Date(now + 180 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (completeError || completed !== true) {
      if (completeError) {
        console.error("Could not persist a refreshed Razorpay token pair.", { code: completeError.code });
      } else {
        console.error("A Razorpay token refresh lost its database lease before completion.");
      }
      return "failed";
    }
    return "refreshed";
  } catch (error) {
    const requiresReconnect = error instanceof RazorpayOAuthError &&
      [400, 401, 403].includes(error.status);
    const errorCode = error instanceof RazorpayOAuthError
      ? `http_${error.status}`
      : "network_or_token_error";
    console.error("A Razorpay token refresh failed.", {
      status: error instanceof RazorpayOAuthError ? error.status : null,
      requiresReconnect,
    });
    const { data: failureRecorded, error: failureError } = await admin.rpc("fail_razorpay_token_refresh", {
      requested_creator_id: claim.creator_id,
      requested_lock_token: claim.lock_token,
      requested_error_code: errorCode,
      requested_reconnect_required: requiresReconnect,
    });
    if (failureError || failureRecorded !== true) {
      if (failureError) {
        console.error("Could not record a failed Razorpay token refresh.", { code: failureError.code });
      } else {
        console.error("A failed Razorpay token refresh could not be recorded.");
      }
    }
    return requiresReconnect ? "reconnect_required" : "failed";
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return jsonResponse({ error: "Unauthorized." }, 401);

  const config = getRazorpayOAuthConfig();
  if (!config) {
    return jsonResponse({ error: "Razorpay OAuth refresh is not configured for this environment." }, 503);
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return jsonResponse({ error: "Razorpay token refresh services are unavailable." }, 503);

  const { data, error } = await admin.rpc("claim_razorpay_token_refresh", {
    requested_environment: config.environment,
    requested_batch_size: 10,
  });
  if (error) {
    console.error("Could not claim due Razorpay token refreshes.", { code: error.code });
    return jsonResponse({ error: "Razorpay token refresh could not start." }, 503);
  }
  if (!Array.isArray(data)) {
    console.error("The Razorpay token refresh claim response was invalid.");
    return jsonResponse({ error: "Razorpay token refresh could not start." }, 503);
  }

  if (data.length > 10) {
    console.error("The Razorpay refresh claim exceeded the configured batch size.");
    return jsonResponse({ error: "Razorpay token refresh could not start." }, 503);
  }
  const outcomes = await Promise.all(data.map(async (candidate) => {
    const claim = parseRefreshClaim(candidate);
    if (!claim) {
      console.error("A Razorpay token refresh claim was invalid.");
      return "failed" as const;
    }
    return refreshClaim(admin, claim, config);
  }));
  return jsonResponse({
    refreshed: outcomes.filter((outcome) => outcome === "refreshed").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    reconnectRequired: outcomes.filter((outcome) => outcome === "reconnect_required").length,
  });
}
