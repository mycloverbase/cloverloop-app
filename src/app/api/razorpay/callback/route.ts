import { NextResponse, type NextRequest } from "next/server";
import { creatorAgreementIsAccepted } from "@/lib/account/creator-agreement-consent";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  encryptRazorpayToken,
  exchangeRazorpayAuthorizationCode,
  getRazorpayApplicationConfig,
  hashRazorpayOAuthState,
  isRazorpayConnectionUsable,
  RazorpayOAuthError,
  selectRazorpayApplication,
  type RazorpayApplicationKey,
} from "@/lib/razorpay/oauth";
import { processRazorpayCommissionAuthorisationEmailQueue } from "@/lib/razorpay/commission-authorisation-email";

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
  });
  if (stateError) {
    console.error("Could not validate a Razorpay OAuth state.", { code: stateError.code });
    return dashboardRedirect(request, "connect-error");
  }
  const stateRecord = Array.isArray(consumedState) ? consumedState[0] : consumedState;
  if (!isRecord(stateRecord)) {
    const { data: priorResult, error: priorResultError } = await admin.rpc(
      "get_razorpay_oauth_state_result",
      {
        requested_state_hash: hashRazorpayOAuthState(state),
        requested_creator_id: user.id,
      },
    );
    if (priorResultError) {
      console.error("Could not check a repeated Razorpay OAuth callback.", {
        code: priorResultError.code,
      });
      return dashboardRedirect(request, "connect-error");
    }
    const priorRow = Array.isArray(priorResult) ? priorResult[0] : priorResult;
    if (isRecord(priorRow) && priorRow.completed === true) {
      return dashboardRedirect(request, "connected");
    }
    return dashboardRedirect(request, "state-error");
  }

  const applicationKey: RazorpayApplicationKey | null =
    stateRecord.application_key === "ZERO_FEE" || stateRecord.application_key === "FOUR_PERCENT"
      ? stateRecord.application_key
      : null;
  const environment = stateRecord.environment === "test" || stateRecord.environment === "live"
    ? stateRecord.environment
    : null;
  const config = applicationKey && environment
    ? getRazorpayApplicationConfig(applicationKey, environment)
    : null;
  if (
    stateRecord.creator_id !== user.id ||
    !config ||
    stateRecord.client_id !== config.clientId ||
    stateRecord.environment !== config.environment ||
    (stateRecord.plan_key !== "free" &&
      stateRecord.plan_key !== "creator" &&
      stateRecord.plan_key !== "pro_creator" &&
      stateRecord.plan_key !== "founding_creator") ||
    typeof stateRecord.commission_percentage !== "number"
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

  const { data: entitlement, error: entitlementError } = await admin
    .from("plan_entitlements")
    .select("plan_key,platform_fee_percentage,founder_status")
    .eq("creator_id", user.id)
    .maybeSingle();
  if (entitlementError || !entitlement) {
    console.error("Could not verify the current subscription for Razorpay OAuth.", {
      code: entitlementError?.code ?? "not_found",
    });
    return dashboardRedirect(request, "connect-error");
  }
  const currentApplication = selectRazorpayApplication(
    entitlement.plan_key,
    entitlement.platform_fee_percentage,
    entitlement.founder_status,
  );
  if (
    entitlement.plan_key !== stateRecord.plan_key ||
    entitlement.platform_fee_percentage !== stateRecord.commission_percentage ||
    currentApplication !== applicationKey
  ) {
    if (typeof stateRecord.migration_id === "string") {
      const { error: migrationError } = await admin
        .from("razorpay_application_migrations")
        .update({
          migration_status: "failed",
          failure_reason: "subscription_changed_during_oauth",
        })
        .eq("id", stateRecord.migration_id)
        .eq("creator_id", user.id)
        .eq("migration_status", "pending");
      if (migrationError) {
        console.error("The stale Razorpay application migration could not be recorded.", {
          code: migrationError.code,
        });
      }
    }
    return dashboardRedirect(request, "plan-changed");
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code || code.length > 4096) return dashboardRedirect(request, "exchange-error");

  const { data: existingConnection, error: existingError } = await admin
    .from("creator_razorpay_connections")
    .select("application_key,connection_status,token_expires_at")
    .eq("creator_id", user.id)
    .eq("environment", config.environment)
    .maybeSingle();
  if (existingError) {
    console.error("Could not check the creator's current Razorpay connection.", { code: existingError.code });
    return dashboardRedirect(request, "connect-error");
  }
  if (
    existingConnection &&
    existingConnection.application_key === applicationKey &&
    isRazorpayConnectionUsable(
      typeof existingConnection.connection_status === "string" ? existingConnection.connection_status : "",
      typeof existingConnection.token_expires_at === "string" ? existingConnection.token_expires_at : null,
    )
  ) {
    return dashboardRedirect(request, "already-connected");
  }

  if (
    (applicationKey === "FOUR_PERCENT" && (
      stateRecord.plan_key !== "creator" ||
      stateRecord.commission_percentage !== 4 ||
      typeof stateRecord.consent_accepted_at !== "string" ||
      typeof stateRecord.consent_terms_version !== "string" ||
      typeof stateRecord.business_name !== "string" ||
      typeof stateRecord.registered_email !== "string"
    )) ||
    (applicationKey === "ZERO_FEE" && stateRecord.consent_accepted_at !== null)
  ) {
    return dashboardRedirect(request, "state-error");
  }
  const partnershipsEmail = process.env.RAZORPAY_PARTNERSHIPS_EMAIL?.trim() ?? "";

  try {
    const tokens = await exchangeRazorpayAuthorizationCode(code, config);
    const now = Date.now();
    const { data: saved, error: saveError } = await admin.rpc("save_razorpay_connection", {
      requested_creator_id: user.id,
      requested_razorpay_account_id: tokens.accountId,
      requested_client_id: config.clientId,
      requested_environment: config.environment,
      requested_application_key: applicationKey,
      requested_plan_key: stateRecord.plan_key,
      requested_commission_percentage: stateRecord.commission_percentage,
      requested_public_token: tokens.publicToken,
      requested_access_token_encrypted: encryptRazorpayToken(tokens.accessToken, user.id, "access", config.environment),
      requested_refresh_token_encrypted: encryptRazorpayToken(tokens.refreshToken, user.id, "refresh", config.environment),
      requested_token_expires_at: new Date(now + tokens.expiresInSeconds * 1000).toISOString(),
      requested_refresh_token_expires_at: new Date(now + 180 * 24 * 60 * 60 * 1000).toISOString(),
      requested_migration_id: typeof stateRecord.migration_id === "string"
        ? stateRecord.migration_id
        : null,
      requested_state_hash: hashRazorpayOAuthState(state),
      requested_partnerships_email: partnershipsEmail,
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
    if (applicationKey === "FOUR_PERCENT") {
      await processRazorpayCommissionAuthorisationEmailQueue(admin, 1);
    }
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
