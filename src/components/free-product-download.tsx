"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { track } from "@/lib/analytics";

declare global {
  interface Window {
    __cloverloopDownloadToken?: string;
    __cloverloopDownloadTokenCleared?: boolean;
  }
}

function getTokenSnapshot() {
  if (typeof window.__cloverloopDownloadToken === "string") {
    return window.__cloverloopDownloadToken;
  }
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const candidate = fragment.get("token") ?? "";
  return /^[A-Za-z0-9_-]{43}$/.test(candidate) ? candidate : "";
}

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("cloverloop-download-token-cleared", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("cloverloop-download-token-cleared", onChange);
  };
}

export function FreeProductDownload() {
  const token = useSyncExternalStore(subscribeToHash, getTokenSnapshot, () => "");
  const [message, setMessage] = useState("Preparing your secure download…");
  const [busy, setBusy] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    window.__cloverloopDownloadToken = getTokenSnapshot();
    window.history.replaceState(null, "", window.location.pathname);
    window.__cloverloopDownloadTokenCleared = true;
    window.dispatchEvent(new Event("cloverloop-download-token-cleared"));
  }, []);

  const startDownload = useCallback(async () => {
    if (!token || attempted.current) return;
    attempted.current = true;
    setBusy(true);
    setMessage("Preparing your secure download…");
    try {
      const response = await fetch("/api/free-product-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token }),
      });
      const result: unknown = await response.json();
      if (
        !response.ok ||
        typeof result !== "object" ||
        result === null ||
        !("ok" in result) ||
        result.ok !== true ||
        !("url" in result) ||
        typeof result.url !== "string"
      ) {
        const errorMessage = typeof result === "object" && result !== null && "error" in result &&
          typeof result.error === "string"
          ? result.error
          : "This download link is invalid or has expired.";
        setMessage(errorMessage);
        attempted.current = false;
        return;
      }

      track("free_product_downloaded");
      window.location.replace(result.url);
    } catch {
      setMessage("We couldn't reach CloverLoop. Check your connection and try again.");
      attempted.current = false;
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const timeout = window.setTimeout(() => void startDownload(), 0);
    return () => window.clearTimeout(timeout);
  }, [token, startDownload]);

  return (
    <main className="free-product-download-page">
      <section className="free-product-download-card" aria-live="polite">
        <span className="eyebrow">CloverLoop secure download</span>
        <h1>Your download</h1>
        <p>{token ? message : "This download link is invalid or has expired. Request a new link from the product storefront."}</p>
        {token && message !== "Preparing your secure download…" && !busy ? (
          <button className="button" type="button" onClick={() => void startDownload()}>
            Try again
          </button>
        ) : null}
      </section>
    </main>
  );
}
