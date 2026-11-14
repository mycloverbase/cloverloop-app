"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    __cloverloopDownloadTokenCleared?: boolean;
    __cloverloopPurchaseTicketCleared?: boolean;
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
    const isFreeDownload = pathname === "/free-product-download";
    const isPurchaseDownload = pathname === "/purchase-download";
    if (!isFreeDownload && !isPurchaseDownload) {
      loadAnalyticsBootstrap(gtmId, consentKey);
      return;
    }

    function onDownloadSecretCleared() {
      loadAnalyticsBootstrap(gtmId, consentKey);
    }

    const secretCleared = isFreeDownload
      ? window.__cloverloopDownloadTokenCleared
      : window.__cloverloopPurchaseTicketCleared;
    if (secretCleared) {
      onDownloadSecretCleared();
      return;
    }
    const eventName = isFreeDownload
      ? "cloverloop-download-token-cleared"
      : "cloverloop-purchase-ticket-cleared";
    window.addEventListener(eventName, onDownloadSecretCleared, { once: true });
    return () => window.removeEventListener(eventName, onDownloadSecretCleared);
  }, [consentKey, gtmId, pathname]);

  return null;
}
