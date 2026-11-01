"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics";

const AUTH_FLOW_KEY = "cloverloop-auth-flow";
const AUTH_METHOD_KEY = "cloverloop-auth-method";
const AUTH_ROUTES = new Set(["/login", "/signup", "/forgot-password", "/auth/callback"]);

export function AuthFlowTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (AUTH_ROUTES.has(pathname)) return;
    const flow = window.localStorage.getItem(AUTH_FLOW_KEY);
    const method = window.localStorage.getItem(AUTH_METHOD_KEY);
    if (flow === "signup" || flow === "login") {
      track(flow === "signup" ? "successful_signup" : "successful_login", {
        method: method === "google" ? "google" : "email",
      });
    }
    window.localStorage.removeItem(AUTH_FLOW_KEY);
    window.localStorage.removeItem(AUTH_METHOD_KEY);
  }, [pathname]);

  return null;
}
