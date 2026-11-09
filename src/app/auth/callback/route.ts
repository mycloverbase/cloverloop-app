import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { safeInternalPath } from "@/lib/auth-redirect";

export async function GET(request: NextRequest) {
  const config = getSupabaseConfig();
  const code = request.nextUrl.searchParams.get("code");
  if (!config || !code) {
    const response = NextResponse.redirect(new URL("/login?error=callback", request.url));
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  const nextPath = safeInternalPath(request.nextUrl.searchParams.get("next"));
  const consentParam = request.nextUrl.searchParams.get("marketing_consent");
  const marketingConsent = consentParam === "1" ? true : consentParam === "0" ? false : null;
  const response = NextResponse.redirect(new URL(nextPath, request.url));
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const failure = NextResponse.redirect(new URL("/login?error=callback", request.url));
    failure.headers.set("X-Robots-Tag", "noindex, nofollow");
    return failure;
  }
  if (marketingConsent !== null) {
    const { error: consentError } = await supabase.rpc("save_my_marketing_consent", {
      requested_consent: marketingConsent,
    });
    if (consentError) {
      console.error("Could not save marketing consent after authentication.", consentError);
      const failure = NextResponse.redirect(new URL("/login?error=consent", request.url));
      failure.headers.set("X-Robots-Tag", "noindex, nofollow");
      return failure;
    }
  }
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
