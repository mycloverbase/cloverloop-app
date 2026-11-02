"use client";

export type AnalyticsEvent =
  | "navigation_click"
  | "pricing_page_visit"
  | "pricing_cta_click"
  | "signup_click"
  | "login_click"
  | "successful_signup"
  | "successful_login"
  | "google_oauth_initiation"
  | "founding_creator_click"
  | "resource_view"
  | "resource_cta_click"
  | "page_view";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const CONSENT_KEY = "cloverloop-analytics-consent";

export function analyticsAllowed() {
  return typeof window !== "undefined" && window.localStorage.getItem(CONSENT_KEY) === "accepted";
}

export function track(event: AnalyticsEvent, values: Record<string, string> = {}) {
  if (!analyticsAllowed()) return;
  const dataLayer = (window.dataLayer = window.dataLayer || []);
  dataLayer.push({ event, ...values });
}

export function updateConsent(choice: "accepted" | "rejected") {
  window.gtag?.("consent", "update", {
    analytics_storage: choice === "accepted" ? "granted" : "denied",
  });
}
