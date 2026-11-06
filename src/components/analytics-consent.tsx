"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  persistAnalyticsConsent,
  readAnalyticsConsent,
  track,
  trackPageView,
  updateConsent,
  type AnalyticsConsentChoice,
  type AnalyticsEvent,
} from "@/lib/analytics";

const CONSENT_CHANGE_EVENT = "cloverloop-consent-change";

function getTrackedLinkEvent(event: string | undefined): AnalyticsEvent | null {
  switch (event) {
    case "pricing_cta_click":
    case "signup_click":
    case "login_click":
    case "founding_creator_click":
    case "resource_cta_click":
      return event;
    default:
      return null;
  }
}

function readConsent() {
  return readAnalyticsConsent() ?? "";
}

function subscribeToConsent(onChange: () => void) {
  function syncConsent() {
    updateConsent(readAnalyticsConsent());
    onChange();
  }
  window.addEventListener("storage", syncConsent);
  window.addEventListener(CONSENT_CHANGE_EVENT, syncConsent);
  return () => {
    window.removeEventListener("storage", syncConsent);
    window.removeEventListener(CONSENT_CHANGE_EVENT, syncConsent);
  };
}

export function AnalyticsConsent() {
  const consent = useSyncExternalStore(subscribeToConsent, readConsent, () => "");
  const pathname = usePathname();
  const lastTitle = useRef("");
  const [storageError, setStorageError] = useState("");

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
      const trackedEvent = getTrackedLinkEvent(anchor.dataset.analyticsEvent);
      if (trackedEvent) {
        const eventValue = anchor.dataset.analyticsEventValue;
        track(trackedEvent, eventValue ? { target: eventValue } : {});
      }
      const destination = new URL(anchor.href, window.location.origin);
      if (destination.origin === window.location.origin) {
        track("navigation_click", { target: destination.pathname });
      }
    }
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, []);

  function choose(choice: AnalyticsConsentChoice) {
    try {
      persistAnalyticsConsent(choice);
      setStorageError("");
    } catch (error) {
      console.error("Could not persist the analytics consent choice.", error);
      updateConsent("rejected");
      setStorageError("Your choice could not be saved. Check your browser storage settings and try again.");
      return;
    }
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
    if (choice === "accepted") trackPageView();
  }

  if (consent) return null;
  return (
    <aside className="consent-banner" aria-label="Cookie preferences">
      <div>
        <strong>Cookie preferences</strong>
        <p>Optional analytics help us understand site usage. Measurement starts only if you allow it.</p>
        {storageError && <p role="alert">{storageError}</p>}
      </div>
      <div className="consent-actions">
        <button className="button button-secondary" onClick={() => choose("rejected")}>
          Reject Analytics
        </button>
        <button className="button" onClick={() => choose("accepted")}>
          Accept Analytics
        </button>
      </div>
    </aside>
  );
}
