"use client";

import { ANALYTICS_CONSENT_KEY } from "@/lib/site";

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
  | "free_product_claim_started"
  | "free_product_claim_completed"
  | "free_product_email_sent"
  | "free_product_downloaded"
  | "page_view";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export type AnalyticsConsentChoice = "accepted" | "rejected";

export function readAnalyticsConsent(): AnalyticsConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const choice = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return choice === "accepted" || choice === "rejected" ? choice : null;
  } catch {
    return null;
  }
}

export function persistAnalyticsConsent(choice: AnalyticsConsentChoice) {
  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, choice);
}

export function analyticsAllowed() {
  return readAnalyticsConsent() === "accepted";
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
  const safeLocation = new URL(window.location.href);
  safeLocation.hash = "";
  safeLocation.searchParams.delete("token");
  safeLocation.searchParams.delete("download_token");
  safeLocation.searchParams.delete("email");
  const pageLocation = safeLocation.toString();
  if (pageLocation === lastPageViewUrl) return;
  lastPageViewUrl = pageLocation;
  track("page_view", {
    page_path: window.location.pathname,
    page_location: pageLocation,
    page_title: document.title,
  });
}

export function updateConsent(choice: AnalyticsConsentChoice | null) {
  window.gtag?.("consent", "update", {
    analytics_storage: choice === "accepted" ? "granted" : "denied",
  });
}
