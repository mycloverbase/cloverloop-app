import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

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
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup", "/:username"],
};
