"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore, useState } from "react";

type Ticket = {
  orderId: string;
  expiresAt: number;
  signature: string;
};

declare global {
  interface Window {
    __cloverloopPurchaseTicket?: Ticket | null;
    __cloverloopPurchaseTicketCleared?: boolean;
  }
}

function getTicketSnapshot(): Ticket | null {
  if (window.__cloverloopPurchaseTicketCleared) return window.__cloverloopPurchaseTicket ?? null;
  if (window.__cloverloopPurchaseTicket) return window.__cloverloopPurchaseTicket;
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const orderId = fragment.get("orderId") ?? "";
  const expiresAt = Number(fragment.get("expiresAt"));
  const signature = fragment.get("signature") ?? "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(Date.now() / 1000) ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  ) {
    window.__cloverloopPurchaseTicket = null;
    return null;
  }
  const ticket = { orderId, expiresAt, signature };
  window.__cloverloopPurchaseTicket = ticket;
  return ticket;
}

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("cloverloop-purchase-ticket-cleared", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("cloverloop-purchase-ticket-cleared", onChange);
  };
}

export function PurchaseDownload() {
  const ticket = useSyncExternalStore(subscribeToHash, getTicketSnapshot, () => null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    window.__cloverloopPurchaseTicket = getTicketSnapshot();
    window.history.replaceState(null, "", window.location.pathname);
    window.__cloverloopPurchaseTicketCleared = true;
    window.dispatchEvent(new Event("cloverloop-purchase-ticket-cleared"));
  }, []);

  const startDownload = useCallback(async () => {
    if (!ticket || attempted.current || busy) return;
    attempted.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/purchase-download/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(ticket),
      });
      const result: unknown = await response.json();
      if (
        !response.ok ||
        typeof result !== "object" ||
        result === null ||
        !("downloadUrl" in result) ||
        typeof result.downloadUrl !== "string"
      ) {
        const errorMessage =
          typeof result === "object" && result !== null && "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "This download link is invalid or has expired.";
        setMessage(errorMessage);
        attempted.current = false;
        return;
      }
      window.location.replace(result.downloadUrl);
    } catch {
      setMessage("We could not reach CloverLoop. Check your connection and try again.");
      attempted.current = false;
    } finally {
      setBusy(false);
    }
  }, [busy, ticket]);

  return (
    <main className="free-product-download-page">
      <section className="free-product-download-card" aria-live="polite">
        <span className="eyebrow">CloverLoop secure download</span>
        <h1>Your product is ready</h1>
        <p>
          {ticket
            ? message || "Your purchase has been verified. Use the button below to securely download your product."
            : "This download link is invalid or has expired. Check your purchase email or contact support."}
        </p>
        {ticket ? (
          <button className="button" type="button" onClick={() => void startDownload()} disabled={busy}>
            {busy ? "Preparing download…" : "Download Product"}
          </button>
        ) : null}
      </section>
    </main>
  );
}
