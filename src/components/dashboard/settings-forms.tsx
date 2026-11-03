"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { LoaderCircle, ShieldCheck, Trash2 } from "lucide-react";
import {
  deleteCreatorAccountAction,
  saveNotificationPreferencesAction,
  saveProfileBasicsAction,
} from "@/app/dashboard/actions";
import { useDashboardUnsavedChanges } from "@/components/dashboard/dashboard-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CreatorProfile } from "@/lib/account/types";

export function AccountBasicsForm({
  profile,
  email,
}: {
  profile: CreatorProfile;
  email: string;
}) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username ?? "");
  const [savedSnapshot, setSavedSnapshot] = useState(
    JSON.stringify([profile.display_name, profile.username ?? ""]),
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const setHasUnsavedChanges = useDashboardUnsavedChanges("account-basics");
  const snapshot = JSON.stringify([displayName, username]);
  const isDirty = snapshot !== savedSnapshot;

  useEffect(() => {
    setHasUnsavedChanges(isDirty);
    return () => setHasUnsavedChanges(false);
  }, [isDirty, setHasUnsavedChanges]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const data = new FormData();
    data.set("display_name", displayName);
    data.set("username", username);
    const submitted = snapshot;
    startTransition(async () => {
      try {
        const result = await saveProfileBasicsAction(data);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setSavedSnapshot(submitted);
        setMessage(result.message);
      } catch (saveError) {
        console.error("Could not save creator account details.", saveError);
        setError("Account details could not be saved. Check your connection and try again.");
      }
    });
  }

  return (
    <form className="dashboard-card dashboard-form-card" onSubmit={submit}>
      <div className="dashboard-section-heading">
        <div>
          <span className="dashboard-card-label">General</span>
          <h2>Account details</h2>
        </div>
        <p>Use your profile to manage creator information associated with this account.</p>
      </div>
      <label className="dashboard-field">
        <span>Registered email</span>
        <input type="email" value={email} readOnly aria-describedby="account-email-note" />
        <small id="account-email-note">Email address changes are managed through account support.</small>
      </label>
      <div className="dashboard-form-grid">
        <label className="dashboard-field">
          <span>Display name</span>
          <input
            maxLength={80}
            autoComplete="name"
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <label className="dashboard-field">
          <span>Username</span>
          <div className="dashboard-username-input">
            <span aria-hidden="true">@</span>
            <input
              minLength={3}
              maxLength={30}
              pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,28}[A-Za-z0-9]"
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
            />
          </div>
          <small>Usernames are unique and case-insensitive.</small>
        </label>
      </div>
      <p className="dashboard-inline-note">
        For your bio, location and social links, visit <Link href="/dashboard/profile">My Profile</Link>.
      </p>
      {error && <p className="dashboard-message dashboard-message-error" role="alert">{error}</p>}
      {message && <p className="dashboard-message dashboard-message-success" role="status">{message}</p>}
      <div className="dashboard-form-actions">
        <span>{isDirty ? "You have unsaved changes." : "Your account details are up to date."}</span>
        <button type="submit" className="button" disabled={isPending || !isDirty}>
          {isPending ? <LoaderCircle className="spin" size={17} /> : null}
          Save details
        </button>
      </div>
    </form>
  );
}

export function PasswordChangeForm({ email, providers }: { email: string; providers: string[] }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const hasEmailProvider = providers.includes("email");
  const providerLabels = providers.map((provider) => {
    if (provider === "email") return "Email and password";
    if (provider === "google") return "Google";
    return provider.replace(/^\w/, (letter) => letter.toUpperCase());
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (newPassword.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new password and confirmation do not match.");
      return;
    }
    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { user }, error: sessionError } = await supabase.auth.getUser();
        if (sessionError) throw sessionError;
        if (!user?.email || user.email !== email) throw new Error("Please sign in again before changing your password.");
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });
        if (verifyError) throw new Error("Your current password could not be verified.");
        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        if (updateError) throw updateError;
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setMessage("Your password has been updated.");
      } catch (authError) {
        console.error("Could not update creator password.", authError);
        setError(authError instanceof Error ? authError.message : "The password could not be updated. Please try again.");
      }
    });
  }

  return (
    <section className="dashboard-card dashboard-form-card">
      <div className="dashboard-section-heading">
        <div>
          <span className="dashboard-card-label">Password and authentication</span>
          <h2>Sign-in method</h2>
        </div>
        <ShieldCheck size={21} aria-hidden="true" />
      </div>
      <p className="dashboard-provider-list">
        Connected provider{providerLabels.length === 1 ? "" : "s"}: {providerLabels.length ? providerLabels.join(", ") : "Email"}
      </p>
      {hasEmailProvider ? (
        <form className="dashboard-password-form" onSubmit={submit}>
          <p>Confirm your current password before choosing a new one.</p>
          <label className="dashboard-field">
            <span>Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>
          <div className="dashboard-form-grid">
            <label className="dashboard-field">
              <span>New password</span>
              <input
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label className="dashboard-field">
              <span>Confirm new password</span>
              <input
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          </div>
          {error && <p className="dashboard-message dashboard-message-error" role="alert">{error}</p>}
          {message && <p className="dashboard-message dashboard-message-success" role="status">{message}</p>}
          <div className="dashboard-form-actions">
            <Link href="/forgot-password">Forgot your password?</Link>
            <button type="submit" className="button" disabled={isPending}>
              {isPending ? <LoaderCircle className="spin" size={17} /> : null}
              Change password
            </button>
          </div>
        </form>
      ) : (
        <div className="dashboard-provider-notice">
          <p>This account signs in with Google. Your password is managed by Google.</p>
        </div>
      )}
    </section>
  );
}

export function NotificationPreferencesForm({ profile }: { profile: CreatorProfile }) {
  const [productAnnouncements, setProductAnnouncements] = useState(profile.product_announcements);
  const [marketingEmails, setMarketingEmails] = useState(profile.marketing_emails);
  const [savedSnapshot, setSavedSnapshot] = useState(
    JSON.stringify([profile.product_announcements, profile.marketing_emails]),
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const setHasUnsavedChanges = useDashboardUnsavedChanges("notification-preferences");
  const snapshot = JSON.stringify([productAnnouncements, marketingEmails]);
  const isDirty = snapshot !== savedSnapshot;

  useEffect(() => {
    setHasUnsavedChanges(isDirty);
    return () => setHasUnsavedChanges(false);
  }, [isDirty, setHasUnsavedChanges]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const data = new FormData();
    data.set("product_announcements", productAnnouncements ? "on" : "off");
    data.set("marketing_emails", marketingEmails ? "on" : "off");
    const submitted = snapshot;
    startTransition(async () => {
      try {
        const result = await saveNotificationPreferencesAction(data);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setSavedSnapshot(submitted);
        setMessage(result.message);
      } catch (saveError) {
        console.error("Could not save notification preferences.", saveError);
        setError("Preferences could not be saved. Check your connection and try again.");
      }
    });
  }

  return (
    <form className="dashboard-card dashboard-form-card" onSubmit={submit}>
      <div className="dashboard-section-heading">
        <div>
          <span className="dashboard-card-label">Notification preferences</span>
          <h2>Email updates</h2>
        </div>
      </div>
      <div className="dashboard-preference-row">
        <div>
          <strong>Important account and security notifications</strong>
          <p>Always on for account access, security and essential service messages.</p>
        </div>
        <span className="dashboard-always-on">Always on</span>
      </div>
      <label className="dashboard-preference-row dashboard-preference-toggle">
        <span>
          <strong>Platform and product announcements</strong>
          <small>News about CloverLoop plans, updates and resources.</small>
        </span>
        <input
          type="checkbox"
          checked={productAnnouncements}
          onChange={(event) => setProductAnnouncements(event.target.checked)}
        />
      </label>
      <label className="dashboard-preference-row dashboard-preference-toggle">
        <span>
          <strong>Marketing communications</strong>
          <small>Occasional promotional and educational emails. You can opt out at any time.</small>
        </span>
        <input
          type="checkbox"
          checked={marketingEmails}
          onChange={(event) => setMarketingEmails(event.target.checked)}
        />
      </label>
      {error && <p className="dashboard-message dashboard-message-error" role="alert">{error}</p>}
      {message && <p className="dashboard-message dashboard-message-success" role="status">{message}</p>}
      <div className="dashboard-form-actions">
        <span>{isDirty ? "You have unsaved changes." : "Your preferences are up to date."}</span>
        <button type="submit" className="button" disabled={isPending || !isDirty}>
          {isPending ? <LoaderCircle className="spin" size={17} /> : null}
          Save preferences
        </button>
      </div>
    </form>
  );
}

export function AccountDeletionForm() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (confirmation !== "DELETE") {
      setError("Type DELETE to confirm account deletion.");
      return;
    }
    if (!window.confirm("Permanently delete your CloverLoop account and associated profile data? This cannot be undone.")) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await deleteCreatorAccountAction(confirmation);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        const supabase = createSupabaseBrowserClient();
        const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
        if (signOutError) {
          console.error("The deleted account's browser session could not be cleared.", signOutError);
          router.replace("/login?account=deleted&session=clear-failed");
          return;
        }
        router.replace("/login?account=deleted");
      } catch (deleteError) {
        console.error("Could not delete the creator account.", deleteError);
        setError("Account deletion could not be completed. Check your connection and try again.");
      }
    });
  }

  return (
    <section className="dashboard-card dashboard-danger-card">
      <div className="dashboard-section-heading">
        <div>
          <span className="dashboard-card-label">Account management</span>
          <h2>Delete account</h2>
        </div>
        <Trash2 size={21} aria-hidden="true" />
      </div>
      <p>
        Deletion permanently removes your CloverLoop sign-in, creator profile, preferences,
        submitted feedback and stored profile picture. Data required for legal, security or
        backup purposes may be retained as described in the Privacy Policy.
      </p>
      {!expanded ? (
        <button type="button" className="dashboard-danger-button" onClick={() => setExpanded(true)}>
          Delete my account
        </button>
      ) : (
        <form className="dashboard-delete-form" onSubmit={submit}>
          <p>To confirm, type <strong>DELETE</strong>. You will be signed out and this action cannot be reversed.</p>
          <label className="dashboard-field">
            <span>Confirmation</span>
            <input
              autoComplete="off"
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          {error && <p className="dashboard-message dashboard-message-error" role="alert">{error}</p>}
          <div className="dashboard-form-actions">
            <button type="button" className="dashboard-small-button" onClick={() => {
              setExpanded(false);
              setConfirmation("");
              setError("");
            }}>
              Cancel
            </button>
            <button type="submit" className="dashboard-danger-button" disabled={isPending || confirmation !== "DELETE"}>
              {isPending ? <LoaderCircle className="spin" size={17} /> : null}
              Permanently delete account
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
