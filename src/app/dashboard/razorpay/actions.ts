"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { creatorAgreementIsAccepted } from "@/lib/account/creator-agreement-consent";
import {
  createRazorpayOAuthState,
  decryptRazorpayToken,
  getRazorpayOAuthConfig,
  getRazorpayOAuthReadiness,
  revokeRazorpayToken,
} from "@/lib/razorpay/oauth";

const settingsPath = "/dashboard/settings";

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

export async function startRazorpayConnectionAction(): Promise<void> {
  const user = await getAuthenticatedCreator();
  if (!user) redirect("/login?next=%2Fdashboard%2Fsettings");

  const config = getRazorpayOAuthConfig();
  const readiness = getRazorpayOAuthReadiness();
  if (!config || !readiness.available) redirect(`${settingsPath}?razorpay=setup-required`);

  const admin = createSupabaseAdminClient();
  if (!admin) redirect(`${settingsPath}?razorpay=service-unavailable`);

  const { state, stateHash } = createRazorpayOAuthState();
  const { error: stateError } = await admin.from("razorpay_oauth_states").insert({
    state_hash: stateHash,
    creator_id: user.id,
    client_id: config.clientId,
    environment: config.environment,
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

  const { data: connection, error: loadError } = await admin
    .from("creator_razorpay_connections")
    .select("client_id,environment,access_token_encrypted,refresh_token_encrypted,token_expires_at,connection_status")
    .eq("creator_id", user.id)
    .maybeSingle();
  if (loadError) {
    console.error("Could not load the creator's Razorpay connection.", { code: loadError.code });
    redirect(`${settingsPath}?razorpay=disconnect-error`);
  }
  if (!connection || connection.connection_status === "disconnected") {
    redirect(`${settingsPath}?razorpay=disconnected`);
  }

  let remoteRevocationSucceeded = true;
  const config = getRazorpayOAuthConfig();
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
          decryptRazorpayToken(connection.access_token_encrypted, user.id, "access"),
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
          decryptRazorpayToken(connection.refresh_token_encrypted, user.id, "refresh"),
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
