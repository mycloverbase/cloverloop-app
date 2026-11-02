"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { track, trackPageView, updateConsent } from "@/lib/analytics";

const CONSENT_KEY = "cloverloop-analytics-consent";
const CONSENT_CHANGE_EVENT = "cloverloop-consent-change";

function readConsent() {
  return typeof window === "undefined" ? "" : window.localStorage.getItem(CONSENT_KEY) ?? "";
}

function subscribeToConsent(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
  };
}

export function AnalyticsConsent() {
  const consent = useSyncExternalStore(subscribeToConsent, readConsent, () => "");
  const pathname = usePathname();
  const lastTitle = useRef("");

  useEffect(() => {
    // Next.js applies the new route's <title> after the route commits, so wait for it to change.
    let done = false;
    const previousTitle = lastTitle.current;
    const titleReady = () => Boolean(document.title) && document.title !== previousTitle;
    function fire() {
      if (done) return;
      done = true;
      observer.disconnect();
      window.clearTimeout(fallback);
      lastTitle.current = document.title;
      trackPageView();
      if (pathname === "/pricing") track("pricing_page_visit");
    }
    const observer = new MutationObserver(() => {
      if (titleReady()) fire();
    });
    const fallback = window.setTimeout(fire, 1000);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    if (titleReady()) fire();
    return () => {
      done = true;
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, [pathname]);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const destination = new URL(anchor.href, window.location.origin);
      if (destination.origin === window.location.origin) {
        track("navigation_click", { target: destination.pathname });
      }
    }
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, []);

  function choose(choice: "accepted" | "rejected") {
    window.localStorage.setItem(CONSENT_KEY, choice);
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
    updateConsent(choice);
    if (choice === "accepted") trackPageView();
  }

  if (consent) return null;
  return (
    <aside className="consent-banner" aria-label="Cookie preferences">
      <div>
        <strong>Cookie preferences</strong>
        <p>Optional analytics help us understand site usage. Measurement starts only if you allow it.</p>
      </div>
      <div className="consent-actions">
        <button className="button button-secondary" onClick={() => choose("rejected")}>
          Reject optional
        </button>
        <button className="button" onClick={() => choose("accepted")}>
          Allow analytics
        </button>
      </div>
    </aside>
  );
}
