import { NextResponse } from "next/server";
import { creatorAgreementIsAccepted } from "@/lib/account/creator-agreement-consent";
import { checkInstagramRateLimit } from "@/lib/instagram/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createInstagramOAuthState, getInstagramConfig, INSTAGRAM_OAUTH_STATE_COOKIE, INSTAGRAM_REQUIRED_SCOPES } from "@/lib/instagram/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const config = getInstagramConfig();
  if (!config || !process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY) {
    return NextResponse.json({ error: "Instagram connection is not configured yet." }, { status: 503 });
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Instagram connection is unavailable." }, { status: 503 });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.redirect(new URL("/login?next=%2Fdashboard%2Finstagram-automations", request.url));
  if (!(await creatorAgreementIsAccepted(supabase))) {
    const destination = new URL("/creator-agreement/accept", request.url);
    destination.searchParams.set("next", "/dashboard/instagram-automations");
    const response = NextResponse.redirect(destination);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Instagram connection is unavailable." }, { status: 503 });
  const withinLimit = await checkInstagramRateLimit(admin, user.id, "oauth-start", 5);
  if (withinLimit === null) return NextResponse.json({ error: "Instagram connection is temporarily unavailable." }, { status: 503 });
  if (!withinLimit) return NextResponse.json({ error: "Too many Instagram connection attempts. Wait a minute and try again." }, { status: 429 });

  const { state, cookieValue } = createInstagramOAuthState(user.id);
  const authorize = new URL("oauth/authorize", "https://www.instagram.com/");
  authorize.searchParams.set("client_id", config.appId);
  authorize.searchParams.set("redirect_uri", config.redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", INSTAGRAM_REQUIRED_SCOPES.join(","));
  authorize.searchParams.set("state", state);

  const response = NextResponse.redirect(authorize);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/api/instagram/callback",
    maxAge: 10 * 60,
  });
  return response;
}
