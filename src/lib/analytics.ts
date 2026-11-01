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
    __cloverloopAnalyticsLoaded?: boolean;
  }
}

const CONSENT_KEY = "cloverloop-analytics-consent";

export function analyticsAllowed() {
  return typeof window !== "undefined" && window.localStorage.getItem(CONSENT_KEY) === "accepted";
}

export function track(event: AnalyticsEvent, values: Record<string, string> = {}) {
  if (!analyticsAllowed()) return;
  const payload = { event, ...values };
  window.dataLayer?.push(payload);
  window.gtag?.("event", event, values);
}

export function loadAnalytics() {
  if (typeof window === "undefined" || !analyticsAllowed() || window.__cloverloopAnalyticsLoaded) {
    return;
  }
  window.__cloverloopAnalyticsLoaded = true;
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID;

  if (gaId) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    document.head.appendChild(script);
    window.dataLayer = window.dataLayer || [];
    window.gtag = (...args: unknown[]) => window.dataLayer?.push(args);
    window.gtag("js", new Date());
    window.gtag("config", gaId, { send_page_view: false });
  }

  if (gtmId) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
    document.head.appendChild(script);
  }
}
