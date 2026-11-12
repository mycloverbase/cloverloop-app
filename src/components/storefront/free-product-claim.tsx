"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { track } from "@/lib/analytics";

type Props = {
  productId: string;
  productName: string;
  storefrontUsername: string;
  linkExpiryHours: number;
};

export function FreeProductClaim({
  productId,
  productName,
  storefrontUsername,
  linkExpiryHours,
}: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  function openForm() {
    setError("");
    setSentTo("");
    setOpen(true);
    track("free_product_claim_started");
  }

  function closeForm() {
    if (busy) return;
    setOpen(false);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/free-product-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          productId,
          storefrontUsername,
          termsAccepted: acceptedTerms,
        }),
      });
      const result: unknown = await response.json();
      if (
        !response.ok ||
        typeof result !== "object" ||
        result === null ||
        !("ok" in result) ||
        result.ok !== true
      ) {
        const message = typeof result === "object" && result !== null && "error" in result &&
          typeof result.error === "string"
          ? result.error
          : "We couldn't process this request. Please try again.";
        setError(message);
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      setSentTo(normalizedEmail);
      track("free_product_claim_completed");
      if ("emailSent" in result && result.emailSent === true) {
        track("free_product_email_sent");
      }
    } catch {
      setError("We couldn't reach CloverLoop. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="storefront-product-action" type="button" onClick={openForm}>
        Get Lead Magnet
      </button>
      {open ? (
        <div className="free-product-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeForm();
        }}>
          <section
            className="free-product-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="free-product-modal-title"
          >
            <button
              className="free-product-modal-close"
              type="button"
              aria-label="Close"
              onClick={closeForm}
              disabled={busy}
            >
              <X size={20} aria-hidden="true" />
            </button>
            {sentTo ? (
              <div className="free-product-claim-success" role="status">
                <span className="storefront-eyebrow">Lead Magnet</span>
                <h2 id="free-product-modal-title">Your product is on its way!</h2>
                <p>We&apos;ve sent the download link to <strong>{sentTo}</strong>. Check your inbox.</p>
                <p className="free-product-claim-note">If you don&apos;t see it soon, check your spam or promotions folder.</p>
                <button className="button" type="button" onClick={closeForm}>Done</button>
              </div>
            ) : (
              <>
                <span className="storefront-eyebrow">Lead Magnet</span>
                <h2 id="free-product-modal-title">Get {productName}</h2>
                <p>Enter your email and we&apos;ll send you a secure download link.</p>
                <form className="free-product-claim-form" onSubmit={submit}>
                  <label htmlFor={`claim-email-${productId}`}>Email address</label>
                  <input
                    id={`claim-email-${productId}`}
                    type="email"
                    name="email"
                    autoComplete="email"
                    maxLength={254}
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                  <label className="free-product-terms">
                    <input
                      type="checkbox"
                      required
                      checked={acceptedTerms}
                      onChange={(event) => setAcceptedTerms(event.target.checked)}
                    />
                    <span>
                      I accept CloverLoop&apos;s <a href="/terms" target="_blank" rel="noreferrer">Terms of Use</a>
                      {" "}and acknowledge the <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
                    </span>
                  </label>
                  {error ? <p className="free-product-claim-error" role="alert">{error}</p> : null}
                  <button className="button" type="submit" disabled={busy}>
                    {busy ? "Sending…" : "Get My Product"}
                  </button>
                  <p className="free-product-claim-note">
                    No CloverLoop account is needed. The download link expires after {linkExpiryHours} hours.
                  </p>
                </form>
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
