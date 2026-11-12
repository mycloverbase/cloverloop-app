import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import {
  createFounderReferralCookieValue,
  FOUNDER_REFERRAL_COOKIE,
  verifyFounderReferralCookie,
} from "@/lib/referrals/server";

export async function proxy(request: NextRequest) {
  const config = getSupabaseConfig();
  if (!config) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const pathname = request.nextUrl.pathname;
  if (pathname === "/" && request.nextUrl.searchParams.has("code")) {
    const callback = new URL("/auth/callback", request.url);
    callback.searchParams.set("code", request.nextUrl.searchParams.get("code") ?? "");
    callback.searchParams.set("next", "/dashboard");
    const marketingConsent = request.nextUrl.searchParams.get("marketing_consent");
    if (marketingConsent === "1" || marketingConsent === "0") {
      callback.searchParams.set("marketing_consent", marketingConsent);
    }
    return NextResponse.redirect(callback);
  }

  const storefrontUsername = /^\/([^/.]+)$/.exec(pathname)?.[1];
  if (storefrontUsername) {
    const { data: redirectUsername, error } = await supabase.rpc("storefront_redirect_target", {
      requested_username: storefrontUsername,
    });
    if (error) {
      console.error("Could not check for a previous storefront URL.", error);
    } else if (typeof redirectUsername === "string" && redirectUsername) {
      const destination = new URL(request.url);
      destination.pathname = `/${encodeURIComponent(redirectUsername)}`;
      return NextResponse.redirect(destination, 301);
    }
  }

  if (!pathname.startsWith("/dashboard") && pathname !== "/login" && pathname !== "/signup") {
    return response;
  }
  const { data: { user } } = await supabase.auth.getUser();

  if (pathname.startsWith("/dashboard") && !user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  if ((pathname === "/login" || pathname === "/signup") && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (pathname === "/signup" && !user && request.nextUrl.searchParams.get("ref") === "founder") {
    const currentValue = request.cookies.get(FOUNDER_REFERRAL_COOKIE)?.value;
    if (!verifyFounderReferralCookie(currentValue)) {
      const signedValue = createFounderReferralCookieValue();
      if (signedValue) {
        response.cookies.set(FOUNDER_REFERRAL_COOKIE, signedValue, {
          httpOnly: true,
          secure: request.nextUrl.protocol === "https:",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
        });
      } else {
        console.error("Founder referral attribution could not be signed because the service role key is unavailable.");
      }
    }
  }
  return response;
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/login", "/signup", "/:username"],
};
