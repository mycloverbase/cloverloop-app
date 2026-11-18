import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  decryptRazorpayToken,
  getRazorpayApplicationConfig,
  RazorpayOAuthError,
  refreshRazorpayTokenPair,
  encryptRazorpayToken,
  type RazorpayOAuthConfig,
} from "@/lib/razorpay/oauth";

export const runtime = "nodejs";

type RefreshClaim = {
  creator_id: string;
  environment: string;
  application_key: string;
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
    (value.application_key !== "ZERO_FEE" && value.application_key !== "FOUR_PERCENT") ||
    typeof value.encrypted_refresh_token !== "string" ||
    typeof value.lock_token !== "string"
  ) return null;
  return {
    creator_id: value.creator_id,
    environment: value.environment,
    application_key: value.application_key,
    encrypted_refresh_token: value.encrypted_refresh_token,
    lock_token: value.lock_token,
  };
}

async function refreshClaim(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  claim: RefreshClaim,
  config: RazorpayOAuthConfig,
): Promise<"refreshed" | "failed" | "reconnect_required"> {
  if (
    claim.environment !== config.environment ||
    claim.application_key !== config.applicationKey
  ) {
    console.error("A Razorpay token refresh claim had a mismatched application or environment.");
    return "failed";
  }

  try {
    const currentRefreshToken = decryptRazorpayToken(
      claim.encrypted_refresh_token,
      claim.creator_id,
      "refresh",
      config.environment,
    );
    const tokens = await refreshRazorpayTokenPair(currentRefreshToken, config);
    const now = Date.now();
    const { data: completed, error: completeError } = await admin.rpc("finish_razorpay_token_refresh", {
      requested_creator_id: claim.creator_id,
        requested_environment: claim.environment,
      requested_lock_token: claim.lock_token,
      requested_public_token: tokens.publicToken,
        requested_access_token_encrypted: encryptRazorpayToken(tokens.accessToken, claim.creator_id, "access", config.environment),
        requested_refresh_token_encrypted: encryptRazorpayToken(tokens.refreshToken, claim.creator_id, "refresh", config.environment),
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
      requested_environment: claim.environment,
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

  const configs = (["test", "live"] as const).flatMap((environment) =>
    (["ZERO_FEE", "FOUR_PERCENT"] as const).map((applicationKey) =>
      getRazorpayApplicationConfig(applicationKey, environment),
    ),
  )
    .filter((config): config is RazorpayOAuthConfig => config !== null);
  if (configs.length === 0) {
    return jsonResponse({ error: "Razorpay OAuth refresh is not configured for this environment." }, 503);
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return jsonResponse({ error: "Razorpay token refresh services are unavailable." }, 503);

  const claimsByApplication = await Promise.all(configs.map(async (config) => {
    const { data, error } = await admin.rpc("claim_razorpay_token_refresh", {
      requested_environment: config.environment,
      requested_application_key: config.applicationKey,
      requested_batch_size: 10,
    });
    if (error) {
      console.error("Could not claim due Razorpay token refreshes.", {
        code: error.code,
        environment: config.environment,
        applicationKey: config.applicationKey,
      });
      return null;
    }
    if (!Array.isArray(data) || data.length > 10) {
      console.error("The Razorpay token refresh claim response was invalid.", {
        environment: config.environment,
        applicationKey: config.applicationKey,
      });
      return null;
    }
    return { config, claims: data };
  }));
  if (claimsByApplication.some((result) => result === null)) {
    return jsonResponse({ error: "Razorpay token refresh could not start." }, 503);
  }

  const outcomes = await Promise.all(claimsByApplication.flatMap((result) => {
    if (!result) return [];
    return result.claims.map(async (candidate) => {
      const claim = parseRefreshClaim(candidate);
      if (!claim) {
        console.error("A Razorpay token refresh claim was invalid.");
        return "failed" as const;
      }
      return refreshClaim(admin, claim, result.config);
    });
  }));
  return jsonResponse({
    refreshed: outcomes.filter((outcome) => outcome === "refreshed").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    reconnectRequired: outcomes.filter((outcome) => outcome === "reconnect_required").length,
  });
}
