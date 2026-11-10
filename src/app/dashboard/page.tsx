import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleCheck, CircleHelp, UserRound } from "lucide-react";
import { getCreatorPlan, creatorPlans } from "@/lib/account/plans";
import { getCreatorName, requireCreatorContext } from "@/lib/account/server";

export const metadata: Metadata = {
  title: "Dashboard | CloverLoop",
  description: "Your CloverLoop creator account overview.",
  robots: { index: false, follow: false },
};

function completionItems(profile: Awaited<ReturnType<typeof requireCreatorContext>>["profile"]) {
  return [
    { label: "Add your display name", complete: Boolean(profile.display_name.trim()) },
    { label: "Choose a unique username", complete: Boolean(profile.username) },
    { label: "Write a short bio", complete: Boolean(profile.bio.trim()) },
    { label: "Upload a profile picture", complete: Boolean(profile.avatar_path) },
    {
      label: "Add a website or social link",
      complete: Boolean(profile.social_links.length),
    },
  ];
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ username?: string | string[] }>;
}) {
  const { username: requestedValue } = await searchParams;
  const requestedUsername = Array.isArray(requestedValue) ? requestedValue[0] : requestedValue;
  const { supabase, user, profile } = await requireCreatorContext();
  const { data: storefront, error: storefrontError } = await supabase
    .from("creator_storefronts")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (storefrontError) {
    console.error("Could not check the creator storefront status.", storefrontError);
    throw new Error("Your storefront status could not be loaded. Please refresh and try again.");
  }
  let profileUsername = profile.username;
  let usernameMessage = "";
  if (!profileUsername && requestedUsername) {
    const candidate = requestedUsername.trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/.test(candidate)) {
      usernameMessage = "Choose a username with 3–30 letters, numbers, underscores or hyphens.";
    } else {
      const { data, error } = await supabase
        .from("creator_profiles")
        .update({ username: candidate })
        .eq("user_id", user.id)
        .is("username", null)
        .select("username")
        .maybeSingle();
      if (error?.code === "23505") {
        usernameMessage = "That selected username is already taken. Choose another in My Profile.";
      } else if (error) {
        console.error("Could not save the selected signup username.", error);
        throw new Error("Your selected username could not be saved. Please update it in My Profile.");
      } else if (data?.username) {
        profileUsername = data.username;
      }
    }
  }
  const name = getCreatorName(profile.display_name, user.email ?? "");
  const plan = creatorPlans[getCreatorPlan(user.app_metadata?.plan)];
  const checklist = completionItems(profile);
  const completed = checklist.filter((item) => item.complete).length;

  return (
    <div className="dashboard-page-content">
      <header className="dashboard-page-heading">
        <div>
          <span className="eyebrow">Creator dashboard</span>
          <h1>Welcome back, {name}</h1>
          <p>Manage your creator profile, account preferences and support requests.</p>
        </div>
      </header>

      <section className="dashboard-founder-banner" aria-labelledby="founder-banner-title">
        <span className="dashboard-card-label">CloverLoop Founding Creator Programme</span>
        <h2 id="founder-banner-title">Pilot status and account availability</h2>
        <p>
          You&apos;re among the early creators in CloverLoop&apos;s pilot. Your creator profile,
          account settings, help and feedback tools are available in your account.
        </p>
        <p>
        <strong>Available now:</strong> create and publish a branded storefront with sample cards
        marked Coming Soon. Checkout, payment processing, product delivery and course hosting are
        not included.
        </p>
        <div className="dashboard-founder-banner-actions">
        {storefront?.status !== "published" ? (
          <Link className="button" href="/dashboard/storefront">
            Set Up Your Storefront <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ) : null}
        <Link className="button" href="/dashboard/profile">
          Complete Your Profile <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link className="dashboard-founder-feedback-link" href="/dashboard/help#feedback">
            Share Feedback <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <p className="dashboard-founder-thanks">Thank you for being part of our journey!</p>
      </section>

      <section className="dashboard-overview-grid" aria-label="Account overview">
        <article className="dashboard-card dashboard-plan-card">
          <div className="dashboard-card-heading">
            <div>
              <span className="dashboard-card-label">Current plan</span>
              <h2>{plan.name}</h2>
            </div>
            <span className="dashboard-plan-price">{plan.monthlyPrice}</span>
          </div>
          <Link className="dashboard-text-link" href="/pricing">
            View all plans <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </article>

        <article className="dashboard-card dashboard-profile-summary">
          <div className="dashboard-card-heading">
            <div>
              <span className="dashboard-card-label">Creator account</span>
              <h2>{profileUsername ? `@${profileUsername}` : "Complete your profile"}</h2>
            </div>
            <UserRound size={22} aria-hidden="true" />
          </div>
          <p>{profile.bio || "Add a short bio and links to complete your creator profile."}</p>
          <Link className="dashboard-text-link" href="/dashboard/profile">
            Manage profile <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link className="dashboard-secondary-link" href="/dashboard/settings">
            Account settings
          </Link>
        </article>
      </section>

      {usernameMessage && (
        <p className="dashboard-message dashboard-message-error" role="alert">
          {usernameMessage} <Link href="/dashboard/profile">Edit your profile</Link>
        </p>
      )}

      <section className="dashboard-card dashboard-checklist" aria-labelledby="profile-checklist-title">
        <div className="dashboard-card-heading">
          <div>
            <span className="dashboard-card-label">Account setup</span>
            <h2 id="profile-checklist-title">Profile completion</h2>
          </div>
          <span className="dashboard-completion-count">{completed} of {checklist.length}</span>
        </div>
        <div
          className="dashboard-progress-track"
          role="progressbar"
          aria-label="Profile completion"
          aria-valuemin={0}
          aria-valuemax={checklist.length}
          aria-valuenow={completed}
        >
          <span style={{ width: `${(completed / checklist.length) * 100}%` }} />
        </div>
        <ul className="dashboard-checklist-items">
          {checklist.map((item) => (
            <li key={item.label} className={item.complete ? "complete" : ""}>
              <CircleCheck size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
        <Link className="dashboard-text-link" href="/dashboard/profile">
          Update your profile <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>

      <section className="dashboard-card dashboard-support-card">
        <div className="dashboard-card-heading">
          <div>
            <span className="dashboard-card-label">Need a hand?</span>
            <h2>Help &amp; support</h2>
          </div>
          <CircleHelp size={21} aria-hidden="true" />
        </div>
        <p>Browse common questions, creator resources or contact the CloverLoop team.</p>
        <Link className="dashboard-text-link" href="/dashboard/help">
          Visit help &amp; support <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
