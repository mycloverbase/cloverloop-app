import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logoutAction } from "./actions";
import { TrackLink } from "@/components/track-link";

function getFoundingFormUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_FOUNDING_CREATOR_FORM_URL?.trim();
  if (!configuredUrl) return null;
  try {
    const url = new URL(configuredUrl);
    if (
      url.protocol === "https:" &&
      (url.hostname === "docs.google.com" || url.hostname === "forms.gle")
    ) {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export const metadata: Metadata = {
  title: "Your CloverLoop onboarding",
  description: "Welcome to CloverLoop.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ username?: string }>;
}) {
  const { username: requestedUsername } = await searchParams;
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?error=configuration");
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?next=/dashboard");

  const storedUsername = user.user_metadata?.storefront_username;
  const username =
    requestedUsername ?? (typeof storedUsername === "string" ? storedUsername : "");
  const storefrontUsername =
    username.length <= 30 &&
    /^[a-zA-Z0-9](?:[a-zA-Z0-9_-]{0,28}[a-zA-Z0-9])?$/.test(username)
      ? username
      : "";
  const formUrl = getFoundingFormUrl();
  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div className="page-width dashboard-header-inner">
          <Link href="/" aria-label="CloverLoop home">
            <Image src="/images/brand/logo.png" alt="CloverLoop" width={148} height={55} priority />
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="logout-button"><LogOut size={17} /> Log out</button>
          </form>
        </div>
      </header>
      <section className="dashboard-content page-width">
        <div className="dashboard-welcome">
          <span className="eyebrow">Your CloverLoop onboarding</span>
          <h1>Welcome to CloverLoop!</h1>
          <p>We&apos;re happy to have you onboard and are all set to begin the journey with you.</p>
          {storefrontUsername && (
            <p className="storefront-username-note">
              Your selected store address: <strong>cloverloop.in/{storefrontUsername}</strong>
            </p>
          )}
          <div className="onboarding-message">
            <p>Before you start selling your digital products, we&apos;d like to invite you to become a part of our Founding Creator Programme.</p>
            <p>As a founding creator, you can share your perspective and help shape tools for independent creators.</p>
          </div>
          {formUrl ? (
            <TrackLink
              href={formUrl}
              target="_blank"
              rel="noopener noreferrer"
              event="founding_creator_click"
              className="button dashboard-cta"
            >
              Join the Founding Creator Programme <ArrowUpRight size={17} />
            </TrackLink>
          ) : (
            <div className="dashboard-form-missing">
              <span className="button disabled-button" aria-disabled="true">Join the Founding Creator Programme <ArrowUpRight size={17} /></span>
              <p>Programme form is not configured. Set NEXT_PUBLIC_FOUNDING_CREATOR_FORM_URL to enable this link.</p>
            </div>
          )}
          <Link href="/" className="dashboard-home-link">Return to the public website</Link>
        </div>
        <div className="dashboard-illustration">
          <Image
            src="/images/home/creator-onboarding-dashboard.webp"
            alt="Creators collaborating on digital products"
            width={1200}
            height={896}
            priority
            sizes="(max-width: 760px) 100vw, 46vw"
          />
        </div>
      </section>
    </main>
  );
}
