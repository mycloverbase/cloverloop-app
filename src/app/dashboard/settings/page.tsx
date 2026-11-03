import type { Metadata } from "next";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import {
  AccountBasicsForm,
  AccountDeletionForm,
  NotificationPreferencesForm,
  PasswordChangeForm,
} from "@/components/dashboard/settings-forms";
import { requireCreatorContext } from "@/lib/account/server";

export const metadata: Metadata = {
  title: "Account settings | CloverLoop",
  robots: { index: false, follow: false },
};

function connectedProviders(user: User) {
  const providers = new Set<string>();
  const appProviders = user.app_metadata?.providers;
  if (Array.isArray(appProviders)) {
    for (const provider of appProviders) {
      if (typeof provider === "string") providers.add(provider);
    }
  }
  for (const identity of user.identities ?? []) {
    if (identity.provider) providers.add(identity.provider);
  }
  if (!providers.size) {
    const provider = user.app_metadata?.provider;
    if (typeof provider === "string") providers.add(provider);
    else if (user.email) providers.add("email");
  }
  return [...providers].sort();
}

export default async function AccountSettingsPage() {
  const { user, profile } = await requireCreatorContext();
  const createdAt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "long",
    timeZone: "Asia/Kolkata",
  }).format(new Date(user.created_at));

  return (
    <div className="dashboard-page-content">
      <header className="dashboard-page-heading">
        <div>
          <span className="eyebrow">Account</span>
          <h1>Settings</h1>
          <p>Manage your account details, sign-in security and communication preferences.</p>
        </div>
      </header>

      <div className="dashboard-stack">
        <AccountBasicsForm profile={profile} email={user.email ?? ""} />
        <PasswordChangeForm email={user.email ?? ""} providers={connectedProviders(user)} />
        <NotificationPreferencesForm profile={profile} />

        <section className="dashboard-card dashboard-account-meta">
          <div>
            <span className="dashboard-card-label">Account management</span>
            <h2>Account created</h2>
            <p>{createdAt}</p>
          </div>
          <p>For more profile details, visit <Link href="/dashboard/profile">My Profile</Link>.</p>
        </section>

        <AccountDeletionForm />
      </div>
    </div>
  );
}
