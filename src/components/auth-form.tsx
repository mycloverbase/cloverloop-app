"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { track } from "@/lib/analytics";
import { safeInternalPath } from "@/lib/auth-redirect";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";
const AUTH_FLOW_KEY = "cloverloop-auth-flow";
const AUTH_METHOD_KEY = "cloverloop-auth-method";

function authCallbackUrl(nextPath: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || window.location.origin;
  return `${siteUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const callbackError = searchParams.get("error");
  const accountDeleted = mode === "login" && searchParams.get("account") === "deleted";
  const sessionClearFailed = searchParams.get("session") === "clear-failed";
  const requestedUsername = searchParams.get("username")?.trim() ?? "";
  const storefrontUsername =
    requestedUsername.length <= 30 &&
    /^[a-zA-Z0-9](?:[a-zA-Z0-9_-]{0,28}[a-zA-Z0-9])?$/.test(requestedUsername)
      ? requestedUsername
      : "";
  const onboardingPath = storefrontUsername
    ? `/dashboard?username=${encodeURIComponent(storefrontUsername)}`
    : "/dashboard";

  useEffect(() => {
    if (callbackError === "callback" || callbackError === "configuration") {
      window.localStorage.removeItem(AUTH_FLOW_KEY);
      window.localStorage.removeItem(AUTH_METHOD_KEY);
    }
  }, [callbackError]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      window.localStorage.setItem(AUTH_FLOW_KEY, mode);
      window.localStorage.setItem(AUTH_METHOD_KEY, "email");
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            ...(storefrontUsername ? { data: { storefront_username: storefrontUsername } } : {}),
            emailRedirectTo: authCallbackUrl(onboardingPath),
          },
        });
        if (authError) throw authError;
        if (data.session) {
          router.replace(onboardingPath);
          router.refresh();
          return;
        }
        setMessage("Check your email for a verification link to finish creating your account.");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
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
    setPending(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const next = mode === "signup" ? onboardingPath : searchParams.get("next") || "/dashboard";
      const safeNext = safeInternalPath(next);
      track("google_oauth_initiation", { mode });
      window.localStorage.setItem(AUTH_FLOW_KEY, mode);
      window.localStorage.setItem(AUTH_METHOD_KEY, "google");
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: authCallbackUrl(safeNext),
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
      <button type="button" className="google-button" disabled={pending} onClick={signInWithGoogle}>
        <GoogleMark /> Continue with Google
      </button>
      <div className="auth-divider"><span>or continue with email</span></div>
      <form className="auth-form" onSubmit={submit}>
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
        {mode === "login" && <Link className="forgot-link" href="/forgot-password">Forgot password?</Link>}
        {visibleError && <p className="form-message form-error" role="alert">{visibleError}</p>}
        {message && <p className="form-message form-success" role="status">{message}</p>}
        <button type="submit" className="button auth-submit" disabled={pending}>
          {pending ? <LoaderCircle className="spin" size={18} /> : null}
          {mode === "signup" ? "Create account" : "Log in"} <ArrowRight size={17} />
        </button>
      </form>
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
