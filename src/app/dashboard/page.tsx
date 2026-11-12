import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CircleCheck, CircleHelp, Package, Store, UserRound } from "lucide-react";
import { creatorPlans } from "@/lib/account/plans";
import { getAvatarSignedUrl, getCreatorName, requireCreatorContext } from "@/lib/account/server";
import { getMyPlanEntitlements } from "@/lib/account/entitlements";
import {
  UpgradeToCreatorButton,
  UpgradeToProCreatorButton,
} from "@/components/dashboard/plan-upgrade-controls";

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
  searchParams: Promise<{ username?: string | string[]; referral?: string | string[] }>;
}) {
  const { username: requestedValue, referral: referralValue } = await searchParams;
  const referralStatus = Array.isArray(referralValue) ? referralValue[0] : referralValue;
  const requestedUsername = Array.isArray(requestedValue) ? requestedValue[0] : requestedValue;
  const { supabase, user, profile } = await requireCreatorContext();
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
  const [entitlements, storefrontResponse, productCountResponse, avatarUrl] = await Promise.all([
    getMyPlanEntitlements(supabase),
    supabase
      .from("creator_storefronts")
      .select("id,username,status")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("storefront_products")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("deleted_at", null),
    getAvatarSignedUrl(supabase, profile.avatar_path),
  ]);
  if (storefrontResponse.error) {
    console.error("Could not load creator storefront status.", storefrontResponse.error);
    throw new Error("Your storefront status could not be loaded. Please try again.");
  }
  if (productCountResponse.error) {
    console.error("Could not load creator product listing count.", productCountResponse.error);
    throw new Error("Your product listing count could not be loaded. Please try again.");
  }
  const storefront = storefrontResponse.data;
  const productCount = productCountResponse.count ?? 0;
  const plan = creatorPlans[entitlements.plan];
  const monthlyPlanPrice = `₹${(entitlements.monthlyPricePaise / 100).toLocaleString("en-IN")}/month`;
  const monthlyGrossSalesLimit = entitlements.monthlyGrossSalesLimitPaise === null
    ? null
    : `₹${(entitlements.monthlyGrossSalesLimitPaise / 100).toLocaleString("en-IN")}`;
  const checklist = completionItems(profile);
  const completed = checklist.filter((item) => item.complete).length;
  const completionPercentage = Math.round((completed / checklist.length) * 100);
  const storefrontStatus = storefront?.status === "published"
    ? "Published"
    : storefront?.status === "deletion_pending"
      ? "Deletion scheduled"
      : storefront
        ? "Draft"
        : "Not set up";
  const founderDate = (value: string | null) => value
    ? new Date(value).toLocaleDateString("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" })
    : "—";

  return (
    <div className="dashboard-page-content">
      <header className="dashboard-page-heading dashboard-welcome-heading">
        <div>
          <span className="eyebrow">Creator dashboard</span>
          <h1>Welcome back, {name}</h1>
          <p>Your creator space is ready. Keep your profile fresh and your storefront looking its best.</p>
        </div>
        <div className="dashboard-welcome-actions">
          {avatarUrl ? (
            <Image className="dashboard-welcome-avatar" src={avatarUrl} alt="" width={56} height={56} unoptimized />
          ) : (
            <span className="dashboard-welcome-avatar dashboard-welcome-avatar-fallback" aria-hidden="true">
              <UserRound size={23} />
            </span>
          )}
          <Link
            className="button button-secondary"
            href={storefront?.status === "published" && storefront.username ? `/${storefront.username}` : "/dashboard/storefront"}
            target={storefront?.status === "published" && storefront.username ? "_blank" : undefined}
            rel={storefront?.status === "published" && storefront.username ? "noopener noreferrer" : undefined}
          >
            <Store size={17} aria-hidden="true" />
            {storefront?.status === "published" ? "View storefront" : "Set up storefront"}
          </Link>
        </div>
      </header>

      {referralStatus === "save-error" ? (
        <p className="dashboard-message dashboard-message-warning" role="alert">
          Your account is ready, but referral attribution could not be saved. Contact CloverLoop support before publishing your storefront.
        </p>
      ) : null}

      {entitlements.founderAllocationNumber !== null ? (
        <section className="dashboard-founder-banner" aria-labelledby="founder-banner-title">
          <span className="dashboard-card-label">Founding Creator Programme</span>
          <h2 id="founder-banner-title">
            {entitlements.founderStatus === "active"
              ? "Welcome to the Founding Creator Programme!"
              : "Your Founding Creator membership has ended"}
          </h2>
          <p>
            {entitlements.founderStatus === "active"
              ? entitlements.plan === "pro_creator"
                ? "Your storefront is live. The programme benefit waives the platform fee for six months; your separately authorised Pro subscription remains active."
                : "Your storefront is live. You have six months of unlimited Creator membership with 0% platform transaction fees."
              : entitlements.plan === "pro_creator"
                ? "Your Founding Creator benefit has expired. Pro Creator remains active at 0%; if that subscription ends, the standard Creator platform fee applies."
                : "Your Creator plan and unlimited listings continue. The standard 4% platform transaction fee now applies."}
          </p>
          <p>
            Allocation #{entitlements.founderAllocationNumber} · Activated {founderDate(entitlements.founderActivatedAt)} ·
            {" "}Expires {founderDate(entitlements.founderExpiresAt)} · Effective platform fee {entitlements.platformFeePercentage}%.
          </p>
        </section>
      ) : null}

      <section className="dashboard-overview-grid" aria-label="Account overview">
        <article className="dashboard-card dashboard-plan-card">
          <div className="dashboard-card-heading">
            <div>
              <span className="dashboard-card-label">Current plan</span>
              <h2>{plan.name}</h2>
            </div>
            <span className="dashboard-plan-price">{monthlyPlanPrice}</span>
          </div>
          <p>{entitlements.platformFeePercentage}% effective CloverLoop platform transaction fee</p>
          <p>
            {entitlements.paidProductLimit === null ? "Unlimited paid" : `${entitlements.paidProductLimit} paid`} and{" "}
            {entitlements.freeProductLimit === null ? "unlimited free" : `${entitlements.freeProductLimit} free`} product listings
            {entitlements.plan === "free" ? " (free product allowance is lifetime)" : ""}.
          </p>
          <p>
            {monthlyGrossSalesLimit
              ? `Monthly Gross Sales limit: ${monthlyGrossSalesLimit} per calendar month. Upgrade to Creator to continue selling after reaching the limit.`
              : "No monthly Gross Sales limit."}
          </p>
          {entitlements.plan === "free" ? (
            <section id="creator-upgrade" className="dashboard-plan-upgrade">
              <h3>Unlock unlimited product listings</h3>
              <p>Upgrade to Creator to publish unlimited paid and free products, remove the ₹10,000 monthly Gross Sales limit, and pay a 4% platform transaction fee.</p>
              <UpgradeToCreatorButton />
            </section>
          ) : entitlements.plan === "creator" ? (
            <section id="pro-upgrade" className="dashboard-plan-upgrade">
              <h3>Upgrade to Pro Creator</h3>
              <p>Eliminate CloverLoop&apos;s platform transaction fee with Pro Creator for ₹2,999/month, excluding applicable GST.</p>
              <UpgradeToProCreatorButton />
              <p>Payment-provider processing charges are additional. Subscription setup is not available until a provider is configured.</p>
            </section>
          ) : (
            <p>
              Pro subscription: {entitlements.subscriptionStatus ?? "Active"}
              {entitlements.nextBillingAt ? ` · Next billing date ${founderDate(entitlements.nextBillingAt)}` : ""}
            </p>
          )}
          {entitlements.plan !== "pro_creator" && entitlements.subscriptionStatus ? (
            <p>
              Pro subscription status: {entitlements.subscriptionStatus}
              {entitlements.nextBillingAt ? ` · Period end ${founderDate(entitlements.nextBillingAt)}` : ""}
            </p>
          ) : null}
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

      <section className="dashboard-account-overview" aria-label="Creator account at a glance">
        <article className="dashboard-account-stat">
          <span className="dashboard-account-stat-icon"><Package size={18} aria-hidden="true" /></span>
          <div>
            <span>Product listings</span>
            <strong>{productCount}</strong>
            <Link href="/dashboard/products">Manage products <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
        </article>
        <article className="dashboard-account-stat">
          <span className="dashboard-account-stat-icon"><UserRound size={18} aria-hidden="true" /></span>
          <div>
            <span>Profile completion</span>
            <strong>{completionPercentage}%</strong>
            <Link href="/dashboard/profile">Complete profile <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
        </article>
        <article className="dashboard-account-stat">
          <span className="dashboard-account-stat-icon"><Store size={18} aria-hidden="true" /></span>
          <div>
            <span>Storefront</span>
            <strong className={storefrontStatus === "Published" ? "dashboard-stat-success" : ""}>{storefrontStatus}</strong>
            <Link href="/dashboard/storefront">{storefront ? "Edit storefront" : "Create storefront"} <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
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
              {!item.complete ? <Link href="/dashboard/profile">Add <ArrowRight size={13} aria-hidden="true" /></Link> : null}
            </li>
          ))}
        </ul>
        <Link className="dashboard-text-link" href="/dashboard/profile">
          Update your profile <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>

      <section className="dashboard-quick-actions" aria-labelledby="quick-actions-title">
        <div className="dashboard-section-heading">
          <div>
            <span className="dashboard-card-label">Keep things moving</span>
            <h2 id="quick-actions-title">Quick actions</h2>
          </div>
        </div>
        <div className="dashboard-quick-action-grid">
          <Link href="/dashboard/products" className="dashboard-quick-action">
            <span className="dashboard-quick-action-icon"><Package size={19} aria-hidden="true" /></span>
            <span><strong>Add a product</strong><small>Build your product library</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/dashboard/storefront" className="dashboard-quick-action">
            <span className="dashboard-quick-action-icon"><Store size={19} aria-hidden="true" /></span>
            <span><strong>Edit storefront</strong><small>Shape your public page</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/dashboard/profile" className="dashboard-quick-action">
            <span className="dashboard-quick-action-icon"><UserRound size={19} aria-hidden="true" /></span>
            <span><strong>Manage profile</strong><small>Update your creator details</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/pricing" className="dashboard-quick-action">
            <span className="dashboard-quick-action-icon"><ArrowRight size={19} aria-hidden="true" /></span>
            <span><strong>Explore plans</strong><small>Compare creator plans</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
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
