import type { Metadata } from "next";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import {
  AccountBasicsForm,
  AccountDeletionForm,
  NotificationPreferencesForm,
  PasswordChangeForm,
} from "@/components/dashboard/settings-forms";
import { RazorpayConnectionCard } from "@/components/dashboard/razorpay-connection-card";
import { requireCreatorContext } from "@/lib/account/server";
import { getRazorpayOAuthReadiness } from "@/lib/razorpay/oauth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ razorpay?: string | string[] }>;
}) {
  const { razorpay: razorpayStatusValue } = await searchParams;
  const { user, profile } = await requireCreatorContext();
  const razorpayStatus = Array.isArray(razorpayStatusValue)
    ? razorpayStatusValue[0]
    : razorpayStatusValue;
  const readiness = getRazorpayOAuthReadiness();
  const admin = createSupabaseAdminClient();
  let razorpayConnection = null;
  let razorpayStatusServiceAvailable = Boolean(admin);
  if (admin) {
    const { data, error } = await admin
      .from("creator_razorpay_connections")
      .select("razorpay_account_id,environment,connection_status,token_expires_at,last_refreshed_at")
      .eq("creator_id", user.id)
      .maybeSingle();
    if (error) {
      console.error("Could not load the creator's Razorpay connection status.", { code: error.code });
      razorpayStatusServiceAvailable = false;
    } else if (data) {
      if (
        typeof data.razorpay_account_id === "string" &&
        (data.environment === "test" || data.environment === "live") &&
        ["connected", "reconnect_required", "revoked", "disconnected"].includes(data.connection_status)
      ) {
        razorpayConnection = {
          accountId: data.razorpay_account_id,
          environment: data.environment,
          status: data.connection_status as "connected" | "reconnect_required" | "revoked" | "disconnected",
          tokenExpiresAt: typeof data.token_expires_at === "string" ? data.token_expires_at : null,
          lastRefreshedAt: typeof data.last_refreshed_at === "string" ? data.last_refreshed_at : null,
        };
      } else {
        console.error("The Razorpay connection status returned by Supabase was invalid.");
        razorpayStatusServiceAvailable = false;
      }
    }
  }
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
        <RazorpayConnectionCard
          readiness={readiness}
          connection={razorpayConnection}
          statusMessage={razorpayStatus}
          statusServiceAvailable={razorpayStatusServiceAvailable}
        />
        <AccountBasicsForm email={user.email ?? ""} />
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
