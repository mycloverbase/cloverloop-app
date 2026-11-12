import { NextResponse, type NextRequest } from "next/server";
import { creatorAgreementIsAccepted } from "@/lib/account/creator-agreement-consent";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  encryptRazorpayToken,
  exchangeRazorpayAuthorizationCode,
  getRazorpayOAuthConfig,
  hashRazorpayOAuthState,
  isRazorpayConnectionUsable,
  RazorpayOAuthError,
} from "@/lib/razorpay/oauth";

export const runtime = "nodejs";

function dashboardRedirect(request: NextRequest, status: string) {
  const response = NextResponse.redirect(new URL(`/dashboard/settings?razorpay=${status}`, request.url));
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(request: NextRequest) {
  const config = getRazorpayOAuthConfig();
  if (!config) return dashboardRedirect(request, "setup-required");

  const supabase = await createSupabaseServerClient();
  if (!supabase) return dashboardRedirect(request, "setup-required");
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return dashboardRedirect(request, "auth-session-expired");

  const state = request.nextUrl.searchParams.get("state");
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    return dashboardRedirect(request, "state-error");
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return dashboardRedirect(request, "service-unavailable");

  const { data: consumedState, error: stateError } = await admin.rpc("consume_razorpay_oauth_state", {
    requested_state_hash: hashRazorpayOAuthState(state),
    requested_creator_id: user.id,
    requested_client_id: config.clientId,
    requested_environment: config.environment,
  });
  if (stateError) {
    console.error("Could not validate a Razorpay OAuth state.", { code: stateError.code });
    return dashboardRedirect(request, "connect-error");
  }
  const stateRecord = Array.isArray(consumedState) ? consumedState[0] : consumedState;
  if (
    !isRecord(stateRecord) ||
    stateRecord.creator_id !== user.id ||
    stateRecord.client_id !== config.clientId ||
    stateRecord.environment !== config.environment
  ) {
    return dashboardRedirect(request, "state-error");
  }
  if (!(await creatorAgreementIsAccepted(supabase))) {
    const destination = new URL("/creator-agreement/accept", request.url);
    destination.searchParams.set("next", "/dashboard/settings");
    const response = NextResponse.redirect(destination);
    response.headers.set("Cache-Control", "no-store, private");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) return dashboardRedirect(request, "authorization-denied");

  const code = request.nextUrl.searchParams.get("code");
  if (!code || code.length > 4096) return dashboardRedirect(request, "exchange-error");

  const { data: existingConnection, error: existingError } = await admin
    .from("creator_razorpay_connections")
    .select("connection_status,token_expires_at")
    .eq("creator_id", user.id)
    .maybeSingle();
  if (existingError) {
    console.error("Could not check the creator's current Razorpay connection.", { code: existingError.code });
    return dashboardRedirect(request, "connect-error");
  }
  if (
    existingConnection &&
    isRazorpayConnectionUsable(
      typeof existingConnection.connection_status === "string" ? existingConnection.connection_status : "",
      typeof existingConnection.token_expires_at === "string" ? existingConnection.token_expires_at : null,
    )
  ) {
    return dashboardRedirect(request, "already-connected");
  }

  try {
    const tokens = await exchangeRazorpayAuthorizationCode(code, config);
    const now = Date.now();
    const { data: saved, error: saveError } = await admin.rpc("save_razorpay_connection", {
      requested_creator_id: user.id,
      requested_razorpay_account_id: tokens.accountId,
      requested_client_id: config.clientId,
      requested_environment: config.environment,
      requested_public_token: tokens.publicToken,
      requested_access_token_encrypted: encryptRazorpayToken(tokens.accessToken, user.id, "access"),
      requested_refresh_token_encrypted: encryptRazorpayToken(tokens.refreshToken, user.id, "refresh"),
      requested_token_expires_at: new Date(now + tokens.expiresInSeconds * 1000).toISOString(),
      requested_refresh_token_expires_at: new Date(now + 180 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (saveError) {
      if (saveError.message === "An active Razorpay connection already exists") {
        return dashboardRedirect(request, "already-connected");
      }
      if (saveError.code === "23505") return dashboardRedirect(request, "account-in-use");
      console.error("Could not securely save the creator's Razorpay connection.", { code: saveError.code });
      const { error: auditError } = await admin.from("razorpay_connection_audit").insert({
        creator_id: user.id,
        action: "connection_attempt_failed",
        environment: config.environment,
        error_code: "connection_persist_failed",
      });
      if (auditError) {
        console.error("Could not record a failed Razorpay connection save.", { code: auditError.code });
      }
      return dashboardRedirect(request, "connect-error");
    }
    if (saved !== true) return dashboardRedirect(request, "connect-error");
    return dashboardRedirect(request, "connected");
  } catch (error) {
    console.error("Razorpay OAuth authorization could not be completed.", {
      status: error instanceof RazorpayOAuthError ? error.status : null,
    });
    const { error: auditError } = await admin.from("razorpay_connection_audit").insert({
      creator_id: user.id,
      action: "connection_attempt_failed",
      environment: config.environment,
      error_code: error instanceof RazorpayOAuthError ? `http_${error.status}` : "provider_or_encryption_error",
    });
    if (auditError) {
      console.error("Could not record a failed Razorpay connection attempt.", { code: auditError.code });
    }
    return dashboardRedirect(request, "exchange-error");
  }
}
