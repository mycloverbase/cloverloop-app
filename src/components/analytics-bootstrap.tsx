"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    __cloverloopDownloadTokenCleared?: boolean;
    __cloverloopAnalyticsBootstrapLoaded?: boolean;
  }
}

function loadAnalyticsBootstrap(gtmId: string, consentKey: string) {
  if (window.__cloverloopAnalyticsBootstrapLoaded) return;
  window.__cloverloopAnalyticsBootstrapLoaded = true;
  const script = document.createElement("script");
  script.id = "google-tag-manager-bootstrap";
  script.src = "/scripts/google-tag-manager-bootstrap.js";
  script.dataset.gtmId = gtmId;
  script.dataset.consentKey = consentKey;
  document.head.appendChild(script);
}

export function AnalyticsBootstrap({
  gtmId,
  consentKey,
}: {
  gtmId: string;
  consentKey: string;
}) {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/free-product-download") {
      loadAnalyticsBootstrap(gtmId, consentKey);
      return;
    }

    function onDownloadTokenCleared() {
      loadAnalyticsBootstrap(gtmId, consentKey);
    }

    if (window.__cloverloopDownloadTokenCleared) {
      onDownloadTokenCleared();
      return;
    }
    window.addEventListener("cloverloop-download-token-cleared", onDownloadTokenCleared, { once: true });
    return () => window.removeEventListener("cloverloop-download-token-cleared", onDownloadTokenCleared);
  }, [consentKey, gtmId, pathname]);

  return null;
}
