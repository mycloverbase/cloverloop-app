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

let lastPageViewUrl = "";

// Sends at most one page_view per distinct URL, only after analytics consent.
export function trackPageView() {
  if (!analyticsAllowed()) return;
  const pageLocation = window.location.href;
  if (pageLocation === lastPageViewUrl) return;
  lastPageViewUrl = pageLocation;
  track("page_view", {
    page_path: window.location.pathname,
    page_location: pageLocation,
    page_title: document.title,
  });
}

export function updateConsent(choice: "accepted" | "rejected") {
  window.gtag?.("consent", "update", {
    analytics_storage: choice === "accepted" ? "granted" : "denied",
  });
}
