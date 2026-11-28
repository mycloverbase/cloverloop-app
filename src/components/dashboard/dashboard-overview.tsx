import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CircleCheck,
  CircleHelp,
  IndianRupee,
  Package,
  ShoppingBag,
  Star,
  Store,
  UserRound,
} from "lucide-react";
import { creatorPlans } from "@/lib/account/plans";
import type { CreatorEntitlements } from "@/lib/account/entitlements";
import type { SalesOverviewPeriod } from "@/lib/dashboard/sales-overview";
import { ChangeMyPlanControl } from "@/components/dashboard/plan-upgrade-controls";
import { SalesOverviewPeriodSelector } from "@/components/dashboard/sales-overview-period-selector";

export type DashboardOverviewProps = {
  name: string;
  avatarUrl: string | null;
  storefront: { status: string; username: string | null } | null;
  referralStatus?: string;
  razorpayNeedsAttention: boolean;
  showOnboardingCard: boolean;
  onboardingCompletedCount: number;
  salesPeriod: SalesOverviewPeriod;
  salesOverview: { revenue: string; sales: string };
  entitlements: CreatorEntitlements;
  profileUsername: string | null;
  profileBio: string;
  productCount: number;
  usernameMessage: string;
  checklist: { label: string; complete: boolean }[];
  reviewSummary?: { count: number; average: number | null } | null;
};

function founderDate(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" })
    : "—";
}

export function DashboardOverview({
  name,
  avatarUrl,
  storefront,
  referralStatus,
  razorpayNeedsAttention,
  showOnboardingCard,
  onboardingCompletedCount,
  salesPeriod,
  salesOverview,
  entitlements,
  profileUsername,
  profileBio,
  productCount,
  usernameMessage,
  checklist,
  reviewSummary,
}: DashboardOverviewProps) {
  const plan = creatorPlans[entitlements.plan];
  const monthlyPlanPrice = `₹${(entitlements.monthlyPricePaise / 100).toLocaleString("en-IN")}/month`;
  const cumulativeGrossSalesLimit = entitlements.cumulativeGrossSalesLimitPaise === null
    ? null
    : `₹${(entitlements.cumulativeGrossSalesLimitPaise / 100).toLocaleString("en-IN")}`;
  const completed = checklist.filter((item) => item.complete).length;
  const completionPercentage = Math.round((completed / checklist.length) * 100);
  const isPublished = storefront?.status === "published" && Boolean(storefront.username);
  const storefrontStatus = storefront?.status === "published"
    ? "Published"
    : storefront?.status === "deletion_pending"
      ? "Deletion scheduled"
      : storefront
        ? "Draft"
        : "Not set up";

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
            href={isPublished ? `/${storefront?.username}` : "/dashboard/storefront"}
            target={isPublished ? "_blank" : undefined}
            rel={isPublished ? "noopener noreferrer" : undefined}
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
      {razorpayNeedsAttention ? (
        <p className="dashboard-message dashboard-message-warning" role="status">
          Your storefront is published, but Razorpay is disconnected or needs reconnection.{" "}
          <Link href="/dashboard/settings">Go to Settings to connect or reconnect Razorpay</Link> before accepting payments.
        </p>
      ) : null}
      {usernameMessage ? (
        <p className="dashboard-message dashboard-message-error" role="alert">
          {usernameMessage} <Link href="/dashboard/profile">Edit your profile</Link>
        </p>
      ) : null}

      {showOnboardingCard ? (
        <section className="dashboard-onboarding-card dashboard-card" aria-labelledby="dashboard-onboarding-title">
          <div>
            <span className="dashboard-card-label">Setup progress</span>
            <h2 id="dashboard-onboarding-title">Your storefront is almost ready</h2>
            <p>Complete your setup to start showcasing and selling your digital products.</p>
            <div className="dashboard-onboarding-progress" role="progressbar" aria-label="Storefront setup progress" aria-valuemin={0} aria-valuemax={7} aria-valuenow={onboardingCompletedCount}>
              <span style={{ width: `${(onboardingCompletedCount / 7) * 100}%` }} />
            </div>
            <small>{onboardingCompletedCount} of 7 steps complete</small>
          </div>
          <Link className="button" href="/onboarding">Continue setup <ArrowRight size={17} aria-hidden="true" /></Link>
        </section>
      ) : null}

      <section className="dashboard-sales-overview" aria-labelledby="dashboard-sales-overview-title">
        <div className="dashboard-sales-heading">
          <div>
            <span className="dashboard-card-label">At a glance</span>
            <h2 id="dashboard-sales-overview-title">Sales Overview</h2>
          </div>
          <SalesOverviewPeriodSelector period={salesPeriod} />
        </div>
        <div className="dashboard-sales-grid">
          <article className="dashboard-card dashboard-sales-card">
            <div className="dashboard-sales-card-copy">
              <span className="dashboard-card-label">Revenue</span>
              <strong className="dashboard-sales-value">{salesOverview.revenue}</strong>
              <span className="dashboard-sales-caption">Total Gross Sales (INR)</span>
            </div>
            <span className="dashboard-sales-icon" aria-hidden="true">
              <IndianRupee size={23} />
            </span>
          </article>
          <article className="dashboard-card dashboard-sales-card">
            <div className="dashboard-sales-card-copy">
              <span className="dashboard-card-label">Sales</span>
              <strong className="dashboard-sales-value">{salesOverview.sales}</strong>
              <span className="dashboard-sales-caption">Successful transactions</span>
            </div>
            <span className="dashboard-sales-icon" aria-hidden="true">
              <ShoppingBag size={23} />
            </span>
          </article>
        </div>
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
        {reviewSummary ? (
          <article className="dashboard-account-stat">
            <span className="dashboard-account-stat-icon"><Star size={18} aria-hidden="true" /></span>
            <div>
              <span>Customer reviews</span>
              <strong>
                {reviewSummary.count && reviewSummary.average !== null
                  ? `${reviewSummary.average.toFixed(1)} ★ · ${reviewSummary.count}`
                  : "No reviews yet"}
              </strong>
              <Link href="/dashboard/reviews">View reviews <ArrowRight size={14} aria-hidden="true" /></Link>
            </div>
          </article>
        ) : null}
      </section>

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
                ? "Your storefront is live. The programme benefit waives the platform fee for the term shown below; your separately authorised Pro subscription remains active."
                : "Your storefront is live. Your Founding Creator benefit includes unlimited Creator membership with 0% platform transaction fees for the term shown below."
              : entitlements.plan === "pro_creator"
                ? "Your Founding Creator benefit has expired. Pro Creator remains active at 0%; if that subscription ends, the standard Creator platform fee applies."
                : "Your Creator plan and unlimited listings continue. The standard 4% platform transaction fee now applies."}
          </p>
          <p>
            Activated {founderDate(entitlements.founderActivatedAt)} ·
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
          <ul className="dashboard-plan-facts">
            <li>{entitlements.platformFeePercentage}% effective CloverLoop platform transaction fee</li>
            <li>
              {entitlements.paidProductLimit === null ? "Unlimited paid" : `${entitlements.paidProductLimit} paid`} and{" "}
              {entitlements.freeProductLimit === null ? "unlimited free" : `${entitlements.freeProductLimit} free`} product listings
              {entitlements.plan === "free" ? " (free product allowance is lifetime)" : ""}.
            </li>
            <li>
              {cumulativeGrossSalesLimit
                ? `Cumulative Gross Sales limit: ${cumulativeGrossSalesLimit} per creator account lifetime. Upgrade to Creator to continue selling after reaching the limit.`
                : "No cumulative Gross Sales limit."}
            </li>
          </ul>
          <section id="plan-change" className="dashboard-plan-upgrade">
            <ChangeMyPlanControl currentPlan={entitlements.plan} />
          </section>
          {entitlements.plan === "pro_creator" ? (
            <p>
              Pro subscription: {entitlements.subscriptionStatus ?? "Active"}
              {entitlements.nextBillingAt ? ` · Next billing date ${founderDate(entitlements.nextBillingAt)}` : ""}
            </p>
          ) : null}
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

        <section className="dashboard-card dashboard-checklist" aria-labelledby="profile-checklist-title">
          <div className="dashboard-card-heading">
            <div>
              <span className="dashboard-card-label">{profileUsername ? `@${profileUsername}` : "Account setup"}</span>
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
          {profileBio ? <p className="dashboard-checklist-bio">{profileBio}</p> : null}
          <div className="dashboard-card-links">
            <Link className="dashboard-text-link" href="/dashboard/profile">
              Manage profile <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link className="dashboard-secondary-link" href="/dashboard/settings">
              Account settings
            </Link>
          </div>
        </section>
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
          <Link href="/dashboard/help" className="dashboard-quick-action">
            <span className="dashboard-quick-action-icon"><CircleHelp size={19} aria-hidden="true" /></span>
            <span><strong>Get help</strong><small>FAQs, resources and support</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
