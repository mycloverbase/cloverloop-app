import { NextResponse, type NextRequest } from "next/server";
import {
  encryptInstagramToken,
  exchangeForLongLivedInstagramToken,
  exchangeInstagramAuthorizationCode,
  getInstagramConfig,
  getInstagramProfile,
  INSTAGRAM_OAUTH_STATE_COOKIE,
  INSTAGRAM_REQUIRED_SCOPES,
  subscribeInstagramComments,
  verifyInstagramOAuthState,
} from "@/lib/instagram/server";
import { creatorAgreementIsAccepted } from "@/lib/account/creator-agreement-consent";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function dashboardRedirect(request: NextRequest, result: string) {
  const response = NextResponse.redirect(new URL(`/dashboard/instagram-automations?instagram=${result}`, request.url));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/instagram/callback",
    maxAge: 0,
  });
  return response;
}

function agreementAcceptanceRedirect(request: NextRequest) {
  const destination = new URL("/creator-agreement/accept", request.url);
  destination.searchParams.set("next", "/dashboard/instagram-automations");
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/instagram/callback",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const config = getInstagramConfig();
  const code = request.nextUrl.searchParams.get("code");
  if (request.nextUrl.searchParams.has("error")) return dashboardRedirect(request, "cancelled");
  if (!config || !code || !process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY) {
    return dashboardRedirect(request, "setup-error");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return dashboardRedirect(request, "setup-error");
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  const stateCookie = request.cookies.get(INSTAGRAM_OAUTH_STATE_COOKIE)?.value;
  if (
    authError ||
    !user ||
    !verifyInstagramOAuthState(request.nextUrl.searchParams.get("state"), stateCookie, user.id)
  ) {
    return dashboardRedirect(request, "state-error");
  }
  if (!(await creatorAgreementIsAccepted(supabase))) {
    return agreementAcceptanceRedirect(request);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return dashboardRedirect(request, "setup-error");

  try {
    const authorization = await exchangeInstagramAuthorizationCode(code, config);
    if (!INSTAGRAM_REQUIRED_SCOPES.every((scope) => authorization.grantedScopes.includes(scope))) {
      return dashboardRedirect(request, "permission-error");
    }
    const longLived = await exchangeForLongLivedInstagramToken(authorization.shortLivedToken, config);
    const profile = await getInstagramProfile(longLived.accessToken);
    const acceptedAccountTypes = new Set(["business", "media_creator"]);
    if (
      profile.userId !== authorization.userId ||
      !profile.accountType ||
      !acceptedAccountTypes.has(profile.accountType.toLowerCase())
    ) {
      return dashboardRedirect(request, "professional-account-required");
    }

    const { data: existing, error: existingError } = await admin
      .from("instagram_connections")
      .select("id,creator_id")
      .eq("instagram_user_id", profile.userId)
      .maybeSingle();
    if (existingError) throw new Error("Could not check the Instagram connection owner.");
    if (existing && existing.creator_id !== user.id) {
      return dashboardRedirect(request, "account-in-use");
    }

    const connectionValues = {
      instagram_username: profile.username,
      access_token_encrypted: encryptInstagramToken(longLived.accessToken),
      token_expires_at: new Date(Date.now() + longLived.expiresIn * 1000).toISOString(),
      granted_scopes: authorization.grantedScopes,
      connection_status: "reauthorization_required",
      connected_at: new Date().toISOString(),
      disconnected_at: null,
    };
    let connectionId: string;
    if (existing) {
      const { data: connection, error: saveError } = await admin
        .from("instagram_connections")
        .update(connectionValues)
        .eq("id", existing.id)
        .eq("creator_id", user.id)
        .select("id")
        .single();
      if (saveError || !connection) throw new Error("Could not securely save the Instagram connection.");
      connectionId = connection.id;
    } else {
      const { data: connection, error: saveError } = await admin
        .from("instagram_connections")
        .insert({
          ...connectionValues,
          creator_id: user.id,
          instagram_user_id: profile.userId,
        })
        .select("id")
        .single();
      if (saveError?.code === "23505") return dashboardRedirect(request, "account-in-use");
      if (saveError || !connection) throw new Error("Could not securely save the Instagram connection.");
      connectionId = connection.id;
    }

    try {
      await subscribeInstagramComments(profile.userId, longLived.accessToken);
    } catch (subscriptionError) {
      console.error("Could not subscribe the Instagram account to comment notifications.", {
        status: subscriptionError instanceof Error && "status" in subscriptionError
          ? subscriptionError.status
          : null,
      });
      const { error: statusError } = await admin
        .from("instagram_connections")
        .update({ connection_status: "reauthorization_required" })
        .eq("id", connectionId)
        .eq("creator_id", user.id);
      if (statusError) console.error("Could not keep an unsubscribed Instagram account inactive.", statusError);
      return dashboardRedirect(request, "webhook-subscription-error");
    }
    const { error: activateError } = await admin
      .from("instagram_connections")
      .update({ connection_status: "connected" })
      .eq("id", connectionId)
      .eq("creator_id", user.id);
    if (activateError) {
      console.error("Instagram webhook subscription succeeded, but the connection could not be activated.", activateError);
      return dashboardRedirect(request, "webhook-subscription-error");
    }
    return dashboardRedirect(request, "connected");
  } catch (error) {
    console.error("Instagram account authorization could not be completed.", {
      status: error instanceof Error && "status" in error ? error.status : null,
    });
    return dashboardRedirect(request, "connection-error");
  }
}
