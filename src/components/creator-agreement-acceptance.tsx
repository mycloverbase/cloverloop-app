"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { acceptCreatorAgreementAction } from "@/app/creator-agreement/actions";
import { safeInternalPath } from "@/lib/auth-redirect";

export function CreatorAgreementAcceptance({
  nextPath,
  initialError,
}: {
  nextPath: string;
  initialError: string;
}) {
  const router = useRouter();
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [agreementError, setAgreementError] = useState("");
  const [ageError, setAgeError] = useState("");
  const [message, setMessage] = useState(initialError);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextAgreementError = agreementAccepted ? "" : "Please accept the Creator Agreement to continue.";
    const nextAgeError = ageConfirmed ? "" : "Please confirm that you are at least 18 years old to continue.";
    setAgreementError(nextAgreementError);
    setAgeError(nextAgeError);
    setMessage("");
    if (nextAgreementError || nextAgeError) return;

    setPending(true);
    try {
      const result = await acceptCreatorAgreementAction(agreementAccepted, ageConfirmed);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      router.replace(safeInternalPath(nextPath));
      router.refresh();
    } catch (error) {
      console.error("Could not complete Creator Agreement acceptance.", error);
      setMessage("Agreement acceptance could not be recorded. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="creator-agreement-acceptance dashboard-card">
      <span className="dashboard-card-label">Required before continuing</span>
      <h1>Review the Creator Agreement</h1>
      <p>Accept the current agreement and confirm that you are at least 18 years old to continue to creator features.</p>
      <form onSubmit={submit} noValidate>
        <label className="creator-agreement-checkbox">
          <input
            type="checkbox"
            checked={agreementAccepted}
            aria-invalid={Boolean(agreementError)}
            aria-describedby={agreementError ? "agreement-acceptance-error" : undefined}
            onChange={(event) => {
              setAgreementAccepted(event.target.checked);
              if (event.target.checked) setAgreementError("");
            }}
          />
          <span>
            I agree to the{" "}
            <Link href="/creator-agreement" target="_blank" rel="noopener noreferrer">
              CloverLoop Creator Agreement
            </Link>.
          </span>
        </label>
        {agreementError ? (
          <small id="agreement-acceptance-error" className="auth-consent-error" role="alert">
            {agreementError}
          </small>
        ) : null}
        <label className="creator-agreement-checkbox creator-agreement-age">
          <input
            type="checkbox"
            checked={ageConfirmed}
            aria-invalid={Boolean(ageError)}
            aria-describedby={ageError ? "agreement-age-error" : undefined}
            onChange={(event) => {
              setAgeConfirmed(event.target.checked);
              if (event.target.checked) setAgeError("");
            }}
          />
          <span>I confirm that I am at least 18 years old.</span>
        </label>
        {ageError ? (
          <small id="agreement-age-error" className="auth-consent-error" role="alert">
            {ageError}
          </small>
        ) : null}
        {message ? <p className="form-message form-error" role="alert">{message}</p> : null}
        <button className="button" type="submit" disabled={pending}>
          {pending ? "Recording acceptance…" : "Accept and continue"}
        </button>
      </form>
    </section>
  );
}
