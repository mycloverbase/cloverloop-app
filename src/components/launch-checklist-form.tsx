"use client";

import { FormEvent, useRef, useState } from "react";

type SubmissionResult = {
  ok?: boolean;
  error?: string;
  marketingConsentSaved?: boolean;
};

function isSubmissionResult(value: unknown): value is SubmissionResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  const result = value as Record<string, unknown>;
  return (
    (result.ok === undefined || typeof result.ok === "boolean") &&
    (result.error === undefined || typeof result.error === "string") &&
    (result.marketingConsentSaved === undefined || typeof result.marketingConsentSaved === "boolean")
  );
}

export function LaunchChecklistForm() {
  const [email, setEmail] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const submissionLock = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLock.current || isComplete) return;
    submissionLock.current = true;
    setIsSubmitting(true);
    setMessage("");
    setIsError(false);
    idempotencyKey.current ??= crypto.randomUUID();

    try {
      const response = await fetch("/api/launch-checklist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify({ email, marketingConsent }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error(
          `The server returned an unexpected response (${response.status}). Please try again later.`,
        );
      }

      const responseBody: unknown = await response.json();
      if (!isSubmissionResult(responseBody)) {
        throw new Error("The server returned an invalid response. Please try again later.");
      }

      const result = responseBody;
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "We couldn't email the checklist. Please try again.");
      }

      setIsComplete(true);
      setMessage(
        marketingConsent && !result.marketingConsentSaved
          ? "The checklist was emailed. Your optional marketing preference could not be saved, so you have not been subscribed."
          : "The checklist has been emailed to you.",
      );
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "We couldn't email the checklist. Please try again.");
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <form className="launch-checklist-form" onSubmit={handleSubmit}>
      <label htmlFor="launch-checklist-email">Email address</label>
      <input
        id="launch-checklist-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={email}
        disabled={isComplete}
        onChange={(event) => setEmail(event.target.value)}
      />
      <label className="consent-label">
        <input
          type="checkbox"
          name="marketingConsent"
          checked={marketingConsent}
          disabled={isComplete}
          onChange={(event) => setMarketingConsent(event.target.checked)}
        />
        <span>Yes, I&apos;d also like occasional CloverLoop product and creator updates. Optional; not needed to receive the checklist.</span>
      </label>
      <button className="button" type="submit" disabled={isSubmitting || isComplete}>
        {isSubmitting ? "Sending…" : isComplete ? "Checklist emailed" : "Email me the checklist"}
      </button>
      {message && (
        <p className={`form-message ${isError ? "form-message-error" : "form-message-success"}`} role={isError ? "alert" : "status"}>
          {message}
        </p>
      )}
    </form>
  );
}
