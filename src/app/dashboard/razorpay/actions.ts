"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { creatorAgreementIsAccepted } from "@/lib/account/creator-agreement-consent";
import {
  createRazorpayOAuthState,
  decryptRazorpayToken,
  getRazorpayApplicationConfig,
  getRazorpayApplicationReadiness,
  getRazorpayOAuthMode,
  selectRazorpayApplication,
  type RazorpayApplicationKey,
  revokeRazorpayToken,
} from "@/lib/razorpay/oauth";

const settingsPath = "/dashboard/settings";
const creatorCommissionTermsVersion = "creator-platform-commission-2026-11-v1";

async function getAuthenticatedCreator() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    if (error) console.error("Could not verify a Razorpay connection action.", error);
    return null;
  }
  if (!(await creatorAgreementIsAccepted(supabase))) {
    redirect("/creator-agreement/accept?next=%2Fdashboard%2Fsettings");
  }
  return user;
}

export async function startRazorpayConnectionAction(formData: FormData): Promise<void> {
  const user = await getAuthenticatedCreator();
  if (!user) redirect("/login?next=%2Fdashboard%2Fsettings");

  const admin = createSupabaseAdminClient();
  if (!admin) redirect(`${settingsPath}?razorpay=service-unavailable`);

  const { data: entitlement, error: entitlementError } = await admin
    .from("plan_entitlements")
    .select("plan_key,platform_fee_percentage,founder_status")
    .eq("creator_id", user.id)
    .maybeSingle();
  if (entitlementError || !entitlement) {
    console.error("Could not verify the creator's current Razorpay entitlement.", {
      code: entitlementError?.code ?? "not_found",
    });
    redirect(`${settingsPath}?razorpay=plan-unavailable`);
  }
  const applicationKey = selectRazorpayApplication(
    entitlement.plan_key,
    entitlement.platform_fee_percentage,
    entitlement.founder_status,
  );
  if (!applicationKey) {
    console.error("The creator's Razorpay plan entitlement is unsupported.");
    redirect(`${settingsPath}?razorpay=plan-unsupported`);
  }

  const environment = getRazorpayOAuthMode();
  const config = getRazorpayApplicationConfig(applicationKey, environment);
  const readiness = getRazorpayApplicationReadiness(applicationKey, environment);
  if (!config || !readiness.available) {
    redirect(`${settingsPath}?razorpay=setup-required`);
  }

  const commissionPercentage = entitlement.platform_fee_percentage;
  const isCommissionAuthorisationRequired = applicationKey === "FOUR_PERCENT";
  const consentAccepted = formData.get("commissionConsent") === "yes";
  const businessName = String(formData.get("businessName") ?? "").trim();
  const registeredEmail = String(formData.get("razorpayEmail") ?? "").trim().toLowerCase();
  if (
    isCommissionAuthorisationRequired &&
    (
      entitlement.plan_key !== "creator" ||
      commissionPercentage !== 4 ||
      !user.email ||
      !consentAccepted ||
      businessName.length < 2 ||
      businessName.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registeredEmail) ||
      registeredEmail.length > 254
    )
  ) {
    redirect(`${settingsPath}?razorpay=commission-consent-required`);
  }

  const { data: existingConnection, error: connectionError } = await admin
    .from("creator_razorpay_connections")
    .select("application_key,creator_plan_key,connection_status,razorpay_account_id")
    .eq("creator_id", user.id)
    .eq("environment", config.environment)
    .maybeSingle();
  if (connectionError) {
    console.error("Could not check the creator's current Razorpay application.", {
      code: connectionError.code,
    });
    redirect(`${settingsPath}?razorpay=connect-error`);
  }

  let migrationId: string | null = null;
  const previousApplication = existingConnection?.application_key === "FOUR_PERCENT"
    ? "FOUR_PERCENT"
    : existingConnection
      ? "ZERO_FEE"
      : null;
  if (previousApplication && previousApplication !== applicationKey) {
    const { data: pendingMigration, error: pendingMigrationError } = await admin
      .from("razorpay_application_migrations")
      .select("id")
      .eq("creator_id", user.id)
      .eq("previous_application", previousApplication)
      .eq("new_application", applicationKey)
      .eq("new_plan", entitlement.plan_key)
      .eq("migration_status", "pending")
      .order("migration_initiated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pendingMigrationError) {
      console.error("Could not check the pending Razorpay application migration.", {
        code: pendingMigrationError.code,
      });
      redirect(`${settingsPath}?razorpay=migration-error`);
    }
    if (pendingMigration && typeof pendingMigration.id === "string") {
      migrationId = pendingMigration.id;
    } else {
      const { data: migration, error: migrationError } = await admin
        .from("razorpay_application_migrations")
        .insert({
          creator_id: user.id,
          previous_application: previousApplication,
          new_application: applicationKey,
          previous_plan: existingConnection?.creator_plan_key ?? null,
          new_plan: entitlement.plan_key,
          migration_status: "pending",
        })
        .select("id")
        .single();
      if (migrationError || !migration || typeof migration.id !== "string") {
        console.error("Could not record the Razorpay application migration.", {
          code: migrationError?.code ?? "invalid_result",
        });
        redirect(`${settingsPath}?razorpay=migration-error`);
      }
      migrationId = migration.id;
    }
  }

  const { state, stateHash } = createRazorpayOAuthState();
  const { error: stateError } = await admin.from("razorpay_oauth_states").insert({
    state_hash: stateHash,
    creator_id: user.id,
    client_id: config.clientId,
    environment: config.environment,
    application_key: applicationKey,
    plan_key: entitlement.plan_key,
    commission_percentage: commissionPercentage,
    consent_accepted_at: isCommissionAuthorisationRequired ? new Date().toISOString() : null,
    consent_terms_version: isCommissionAuthorisationRequired
      ? creatorCommissionTermsVersion
      : null,
    business_name: isCommissionAuthorisationRequired ? businessName : null,
    registered_email: isCommissionAuthorisationRequired ? registeredEmail : null,
    migration_id: migrationId,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (stateError) {
    console.error("Could not save a Razorpay OAuth state.", { code: stateError.code });
    redirect(`${settingsPath}?razorpay=connect-error`);
  }

  const { error: auditError } = await admin.from("razorpay_connection_audit").insert({
    creator_id: user.id,
    action: "connection_started",
    environment: config.environment,
    application_key: applicationKey,
  });
  if (auditError) {
    console.error("Could not record a Razorpay connection attempt.", { code: auditError.code });
    redirect(`${settingsPath}?razorpay=connect-error`);
  }

  const authorizationUrl = new URL("https://auth.razorpay.com/authorize");
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizationUrl.searchParams.set("scope", "read_write");
  authorizationUrl.searchParams.set("state", state);
  redirect(authorizationUrl.toString());
}

export async function disconnectRazorpayConnectionAction(): Promise<void> {
  const user = await getAuthenticatedCreator();
  if (!user) redirect("/login?next=%2Fdashboard%2Fsettings");

  const admin = createSupabaseAdminClient();
  if (!admin) redirect(`${settingsPath}?razorpay=service-unavailable`);
  const environment = getRazorpayOAuthMode();
  if (!environment) redirect(`${settingsPath}?razorpay=setup-required`);

  const { data: connectionApp, error: connectionAppError } = await admin
    .from("creator_razorpay_connections")
    .select("application_key")
    .eq("creator_id", user.id)
    .eq("environment", environment)
    .maybeSingle();
  if (connectionAppError) {
    console.error("Could not verify the creator's Razorpay application.", {
      code: connectionAppError.code,
    });
    redirect(`${settingsPath}?razorpay=disconnect-error`);
  }
  const applicationKey: RazorpayApplicationKey =
    connectionApp?.application_key === "FOUR_PERCENT" ? "FOUR_PERCENT" : "ZERO_FEE";
  const config = getRazorpayApplicationConfig(applicationKey, environment);

  const { data: connection, error: loadError } = await admin
    .from("creator_razorpay_connections")
    .select("application_key,client_id,environment,access_token_encrypted,refresh_token_encrypted,token_expires_at,connection_status")
    .eq("creator_id", user.id)
    .eq("environment", environment)
    .maybeSingle();
  if (loadError) {
    console.error("Could not load the creator's Razorpay connection.", { code: loadError.code });
    redirect(`${settingsPath}?razorpay=disconnect-error`);
  }
  if (!connection || connection.connection_status === "disconnected") {
    redirect(`${settingsPath}?razorpay=disconnected`);
  }

  let remoteRevocationSucceeded = true;
  if (
    !config ||
    config.environment !== connection.environment ||
    config.clientId !== connection.client_id
  ) {
    remoteRevocationSucceeded = false;
  } else {
    try {
      if (
        typeof connection.access_token_encrypted === "string" &&
        typeof connection.token_expires_at === "string" &&
        new Date(connection.token_expires_at).getTime() > Date.now()
      ) {
        await revokeRazorpayToken(
          decryptRazorpayToken(connection.access_token_encrypted, user.id, "access", environment),
          "access_token",
          config,
        );
      }
    } catch (error) {
      remoteRevocationSucceeded = false;
      console.error("Razorpay access-token revocation failed.", {
        status: typeof error === "object" && error !== null && "status" in error
          ? error.status
          : null,
      });
    }

    try {
      if (typeof connection.refresh_token_encrypted !== "string") {
        remoteRevocationSucceeded = false;
      } else {
        await revokeRazorpayToken(
          decryptRazorpayToken(connection.refresh_token_encrypted, user.id, "refresh", environment),
          "refresh_token",
          config,
        );
      }
    } catch (error) {
      remoteRevocationSucceeded = false;
      console.error("Razorpay refresh-token revocation failed.", {
        status: typeof error === "object" && error !== null && "status" in error
          ? error.status
          : null,
      });
    }
  }

  const { error: disconnectError } = await admin
    .from("creator_razorpay_connections")
    .update({
      connection_status: "disconnected",
      public_token: null,
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
      refresh_token_expires_at: null,
      disconnected_at: new Date().toISOString(),
      last_error_code: remoteRevocationSucceeded ? null : "remote_revocation_unconfirmed",
      refresh_lock_token: null,
      refresh_lock_expires_at: null,
    })
    .eq("creator_id", user.id)
    .eq("environment", environment)
    .in("connection_status", ["connected", "reconnect_required", "revoked"]);
  if (disconnectError) {
    console.error("Could not disconnect the creator's Razorpay account.", { code: disconnectError.code });
    redirect(`${settingsPath}?razorpay=disconnect-error`);
  }

  const { error: auditError } = await admin.from("razorpay_connection_audit").insert({
    creator_id: user.id,
    action: remoteRevocationSucceeded ? "disconnected" : "connection_revocation_failed",
    environment: connection.environment,
    error_code: remoteRevocationSucceeded ? null : "remote_revocation_unconfirmed",
  });
  if (auditError) {
    console.error("Could not record a Razorpay disconnect.", { code: auditError.code });
    redirect(`${settingsPath}?razorpay=audit-error`);
  }

  redirect(`${settingsPath}?razorpay=${remoteRevocationSucceeded ? "disconnected" : "disconnect-warning"}`);
}
