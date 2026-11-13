"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { track } from "@/lib/analytics";
import { safeInternalPath } from "@/lib/auth-redirect";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  acceptCreatorAgreementAction,
  issueCreatorAgreementAcceptanceProofAction,
  recordCreatorAgreementAcceptanceAction,
} from "@/app/creator-agreement/actions";

type AuthMode = "login" | "signup";
const AUTH_FLOW_KEY = "cloverloop-auth-flow";
const AUTH_METHOD_KEY = "cloverloop-auth-method";

function authCallbackUrl(nextPath: string, marketingConsent?: boolean) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || window.location.origin;
  const callback = new URL("/auth/callback", siteUrl);
  callback.searchParams.set("next", nextPath);
  if (marketingConsent !== undefined) {
    callback.searchParams.set("marketing_consent", marketingConsent ? "1" : "0");
  }
  return callback.toString();
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(true);
  const [marketingConsentTouched, setMarketingConsentTouched] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [agreementError, setAgreementError] = useState("");
  const [ageError, setAgeError] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [agreementOpen, setAgreementOpen] = useState(false);
  const agreementDialogRef = useRef<HTMLDialogElement>(null);
  const callbackError = searchParams.get("error");
  const consentRequired = searchParams.get("consent") === "required";
  const accountDeleted = mode === "login" && searchParams.get("account") === "deleted";
  const sessionClearFailed = searchParams.get("session") === "clear-failed";
  const requestedUsername = searchParams.get("username")?.trim() ?? "";
  const storefrontUsername =
    requestedUsername.length <= 30 &&
    /^[a-zA-Z0-9](?:[a-zA-Z0-9_-]{1,28}[a-zA-Z0-9])$/.test(requestedUsername)
      ? requestedUsername
      : "";
  const onboardingPath = storefrontUsername
    ? `/dashboard?username=${encodeURIComponent(storefrontUsername)}`
    : "/dashboard";

  useEffect(() => {
    const dialog = agreementDialogRef.current;
    if (!dialog) return;
    if (agreementOpen && !dialog.open) dialog.showModal();
    if (!agreementOpen && dialog.open) dialog.close();
  }, [agreementOpen]);

  function validateCreatorConsent() {
    const hasAgreement = agreementAccepted;
    const hasAgeConfirmation = ageConfirmed;
    setAgreementError(hasAgreement ? "" : "Please accept the Creator Agreement to continue.");
    setAgeError(hasAgeConfirmation ? "" : "Please confirm that you are at least 18 years old to continue.");
    setError("");
    return hasAgreement && hasAgeConfirmation;
  }

  useEffect(() => {
    if (callbackError === "callback" || callbackError === "configuration" || callbackError === "consent") {
      window.localStorage.removeItem(AUTH_FLOW_KEY);
      window.localStorage.removeItem(AUTH_METHOD_KEY);
    }
  }, [callbackError]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (consentRequired) {
      if (!validateCreatorConsent()) return;
      setPending(true);
      try {
        const acceptance = await acceptCreatorAgreementAction(agreementAccepted, ageConfirmed);
        if (!acceptance.ok) {
          setError(acceptance.message);
          return;
        }
        router.replace(safeInternalPath(searchParams.get("next")));
        router.refresh();
      } catch (acceptanceError) {
        console.error("Could not complete Creator Agreement acceptance after Google sign-in.", acceptanceError);
        setError("Agreement acceptance could not be recorded. Please try again.");
      } finally {
        setPending(false);
      }
      return;
    }
    if (mode === "signup" && !validateCreatorConsent()) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      window.localStorage.setItem(AUTH_FLOW_KEY, mode);
      window.localStorage.setItem(AUTH_METHOD_KEY, "email");
      if (mode === "signup") {
        const proofResult = await issueCreatorAgreementAcceptanceProofAction(agreementAccepted, ageConfirmed);
        if (!proofResult.ok) {
          setError(proofResult.message);
          return;
        }
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              ...(storefrontUsername ? { storefront_username: storefrontUsername } : {}),
              marketing_emails: marketingConsent,
              ...(marketingConsent ? { marketing_consent_at: new Date().toISOString() } : {}),
            },
            emailRedirectTo: authCallbackUrl(onboardingPath, marketingConsent),
          },
        });
        if (authError) throw authError;
        if (data.session) {
          const acceptance = await recordCreatorAgreementAcceptanceAction();
          if (!acceptance.ok) {
            const acceptancePath = new URL("/creator-agreement/accept", window.location.origin);
            acceptancePath.searchParams.set("next", onboardingPath);
            acceptancePath.searchParams.set("error", "save");
            router.replace(`${acceptancePath.pathname}${acceptancePath.search}`);
            router.refresh();
            return;
          }
          let referralSaved = true;
          try {
            const referralResponse = await fetch("/api/founder-referral", {
              method: "POST",
              cache: "no-store",
            });
            referralSaved = referralResponse.ok;
          } catch (referralError) {
            console.error("Could not finish founder referral attribution after account creation.", referralError);
            referralSaved = false;
          }
          const destination = new URL(onboardingPath, window.location.origin);
          if (!referralSaved) destination.searchParams.set("referral", "save-error");
          router.replace(`${destination.pathname}${destination.search}`);
          router.refresh();
          return;
        }
        setMessage("Check your email for a verification link to finish creating your account.");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        if (marketingConsentTouched) {
          const { error: consentError } = await supabase.rpc("save_my_marketing_consent", {
            requested_consent: marketingConsent,
          });
          if (consentError) throw new Error("You are signed in, but your marketing preference could not be saved. Update it in Account settings.");
        }
        const next = searchParams.get("next");
        router.replace(safeInternalPath(next));
        router.refresh();
        return;
      }
    } catch (authError) {
      window.localStorage.removeItem(AUTH_FLOW_KEY);
      window.localStorage.removeItem(AUTH_METHOD_KEY);
      setError(authError instanceof Error ? authError.message : "Authentication could not be completed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function signInWithGoogle() {
    if (mode === "signup" && !validateCreatorConsent()) return;
    setPending(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const next = mode === "signup" ? onboardingPath : searchParams.get("next") || "/dashboard";
      const safeNext = safeInternalPath(next);
      track("google_oauth_initiation", { mode });
      window.localStorage.setItem(AUTH_FLOW_KEY, mode);
      window.localStorage.setItem(AUTH_METHOD_KEY, "google");
      const proofResult = mode === "signup"
        ? await issueCreatorAgreementAcceptanceProofAction(agreementAccepted, ageConfirmed)
        : null;
      if (proofResult && !proofResult.ok) {
        setError(proofResult.message);
        setPending(false);
        return;
      }
      const callbackUrl = authCallbackUrl(
        safeNext,
        mode === "signup" ? marketingConsent : marketingConsentTouched ? marketingConsent : undefined,
      );
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl,
        },
      });
      if (authError) throw authError;
    } catch (authError) {
      window.localStorage.removeItem(AUTH_FLOW_KEY);
      window.localStorage.removeItem(AUTH_METHOD_KEY);
      setError(authError instanceof Error ? authError.message : "Google sign-in could not be started.");
      setPending(false);
    }
  }

  const visibleError =
    error ||
    (callbackError === "callback"
      ? "Authentication could not be completed. Check the Supabase redirect configuration and try again."
      : callbackError === "configuration"
        ? "Authentication is not configured yet. Contact the CloverLoop team."
        : callbackError === "consent"
          ? "Your marketing preference could not be saved. Please sign in again and update it in Account settings."
        : "");

  return (
    <div className="auth-form-wrap">
      {accountDeleted && (
        <p className="form-message form-success" role="status">
          Your CloverLoop account has been deleted.
          {sessionClearFailed ? " This browser session could not be cleared automatically; close this tab before signing in again." : ""}
        </p>
      )}
      {mode === "signup" && storefrontUsername && (
        <p className="storefront-username-note" role="note">
          Your selected store address: <strong>cloverloop.in/{storefrontUsername}</strong>
        </p>
      )}
      {!consentRequired ? (
        <>
          <button type="button" className="google-button" disabled={pending} onClick={signInWithGoogle}>
            <GoogleMark /> Continue with Google
          </button>
          <div className="auth-divider"><span>or continue with email</span></div>
        </>
      ) : (
        <p className="form-message">
          Confirm your agreement and age to finish setting up your account.
        </p>
      )}
      <form className="auth-form" onSubmit={submit}>
        {!consentRequired ? (
          <>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby={mode === "signup" ? "password-hint" : undefined}
            />
            {mode === "signup" && <span id="password-hint" className="field-hint">Use at least 8 characters.</span>}
            <label className="auth-marketing-consent">
              <input
                type="checkbox"
                name="marketing_consent"
                checked={marketingConsent}
                onChange={(event) => {
                  setMarketingConsent(event.target.checked);
                  setMarketingConsentTouched(true);
                }}
              />
              <span>Opt in for news about CloverLoop plans, updates and resources.</span>
            </label>
          </>
        ) : null}
        {mode === "signup" || consentRequired ? (
          <>
            <label className="auth-legal-consent">
              <input
                type="checkbox"
                name="creator_agreement_accepted"
                checked={agreementAccepted}
                aria-describedby={agreementError ? "creator-agreement-error" : undefined}
                aria-invalid={Boolean(agreementError)}
                onChange={(event) => {
                  setAgreementAccepted(event.target.checked);
                  if (event.target.checked) setAgreementError("");
                }}
              />
              <span>
                I agree to the{" "}
                <button
                  type="button"
                  className="auth-agreement-link"
                  onClick={() => setAgreementOpen(true)}
                >
                  CloverLoop Creator Agreement
                </button>.
              </span>
            </label>
            {agreementError ? (
              <small id="creator-agreement-error" className="auth-consent-error" role="alert">
                {agreementError}
              </small>
            ) : null}
            <label className="auth-legal-consent auth-age-consent">
              <input
                type="checkbox"
                name="age_confirmed"
                checked={ageConfirmed}
                aria-describedby={ageError ? "creator-age-error" : undefined}
                aria-invalid={Boolean(ageError)}
                onChange={(event) => {
                  setAgeConfirmed(event.target.checked);
                  if (event.target.checked) setAgeError("");
                }}
              />
              <span>I confirm that I am at least 18 years old.</span>
            </label>
            {ageError ? (
              <small id="creator-age-error" className="auth-consent-error" role="alert">
                {ageError}
              </small>
            ) : null}
          </>
        ) : null}
        {!consentRequired && mode === "login" && <Link className="forgot-link" href="/forgot-password">Forgot password?</Link>}
        {visibleError && <p className="form-message form-error" role="alert">{visibleError}</p>}
        {message && <p className="form-message form-success" role="status">{message}</p>}
        <button type="submit" className="button auth-submit" disabled={pending}>
          {pending ? <LoaderCircle className="spin" size={18} /> : null}
          {consentRequired ? "Continue" : mode === "signup" ? "Create account" : "Log in"} <ArrowRight size={17} />
        </button>
      </form>
      <dialog
        ref={agreementDialogRef}
        className="auth-agreement-dialog"
        aria-label="CloverLoop Creator Agreement"
        onClose={() => setAgreementOpen(false)}
      >
        <button
          type="button"
          className="auth-agreement-dialog-close"
          aria-label="Close Creator Agreement"
          onClick={() => agreementDialogRef.current?.close()}
        >
          ×
        </button>
        <iframe title="CloverLoop Creator Agreement" src="/creator-agreement" />
      </dialog>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
      <path fill="#4285F4" d="M19.6 10.23c0-.68-.06-1.36-.18-2H10v3.8h5.39a4.62 4.62 0 0 1-2 3.03v2.48h3.23c1.9-1.75 2.98-4.33 2.98-7.31Z" />
      <path fill="#34A853" d="M10 20c2.7 0 4.97-.9 6.62-2.46l-3.23-2.48c-.9.6-2.05.95-3.39.95-2.6 0-4.81-1.76-5.6-4.13H1.06v2.55A10 10 0 0 0 10 20Z" />
      <path fill="#FBBC05" d="M4.4 11.88a6 6 0 0 1 0-3.76V5.57H1.06a10 10 0 0 0 0 8.86l3.34-2.55Z" />
      <path fill="#EA4335" d="M10 3.99c1.47 0 2.78.5 3.82 1.5l2.86-2.87C14.96.99 12.7 0 10 0a10 10 0 0 0-8.94 5.57L4.4 8.12C5.19 5.75 7.4 3.99 10 3.99Z" />
    </svg>
  );
}
