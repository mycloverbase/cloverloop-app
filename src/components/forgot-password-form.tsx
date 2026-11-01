"use client";

import { useEffect, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function authCallbackUrl(nextPath: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || window.location.origin;
  return `${siteUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRecovery, setIsRecovery] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function checkRecoverySession() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (active && data.session) setIsRecovery(true);
      } catch (authError) {
        if (active) setError(authError instanceof Error ? authError.message : "Supabase is not configured.");
      }
    }
    void checkRecoverySession();
    return () => { active = false; };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      if (isRecovery) {
        const { error: authError } = await supabase.auth.updateUser({ password });
        if (authError) throw authError;
        setMessage("Your password has been updated. You can now sign in.");
        setPassword("");
        setIsRecovery(false);
      } else {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: authCallbackUrl("/forgot-password"),
        });
        if (authError) throw authError;
        setMessage("If an account exists for that email, a password reset link is on its way.");
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "The request could not be completed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {isRecovery ? (
        <>
          <label htmlFor="new-password">New password</label>
          <input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
        </>
      ) : (
        <>
          <label htmlFor="reset-email">Email address</label>
          <input id="reset-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </>
      )}
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      {message && <p className="form-message form-success" role="status">{message}</p>}
      <button type="submit" className="button auth-submit" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={18} /> : null}
        {isRecovery ? "Update password" : "Send reset link"} <ArrowRight size={17} />
      </button>
    </form>
  );
}
