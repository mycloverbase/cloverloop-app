import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CircleCheck,
  CircleHelp,
  IndianRupee,
  Package,
  ShoppingBag,
  Store,
  UserRound,
} from "lucide-react";
import { creatorPlans } from "@/lib/account/plans";
import { getAvatarSignedUrl, getCreatorName, requireCreatorContext } from "@/lib/account/server";
import { getMyPlanEntitlements } from "@/lib/account/entitlements";
import { ChangeMyPlanControl } from "@/components/dashboard/plan-upgrade-controls";
import {
  getRazorpayOAuthMode,
  selectRazorpayApplication,
} from "@/lib/razorpay/oauth";
import { getRazorpayCheckoutConnectionStatus } from "@/lib/razorpay/checkout";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatSalesOverview, parseSalesOverviewPeriod } from "@/lib/dashboard/sales-overview";
import { SalesOverviewPeriodSelector } from "@/components/dashboard/sales-overview-period-selector";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    username?: string | string[];
    referral?: string | string[];
    period?: string | string[];
  }>;
}) {
  const {
    username: requestedValue,
    referral: referralValue,
    period: periodValue,
  } = await searchParams;
  const referralStatus = Array.isArray(referralValue) ? referralValue[0] : referralValue;
  const requestedUsername = Array.isArray(requestedValue) ? requestedValue[0] : requestedValue;
  const salesPeriod = parseSalesOverviewPeriod(periodValue);
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
  const [
    entitlements,
    storefrontResponse,
    productCountResponse,
    activePaidProductCountResponse,
    onboardingProgressResponse,
    avatarUrl,
    salesOverviewResponse,
  ] = await Promise.all([
    getMyPlanEntitlements(supabase),
    supabase
      .from("creator_storefronts")
      .select("id,username,status,store_name,profile_image_path,description,theme,customization")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("storefront_products")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("deleted_at", null),
    supabase
      .from("storefront_products")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("is_free", false)
      .gt("price_paise", 0)
      .is("deleted_at", null),
    supabase
      .from("creator_onboarding_progress")
      .select("completed_steps,skipped_steps,completed_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    getAvatarSignedUrl(supabase, profile.avatar_path),
    supabase.rpc("get_my_sales_overview", { p_period: salesPeriod }),
  ]);
  if (storefrontResponse.error) {
    console.error("Could not load creator storefront status.", storefrontResponse.error);
    throw new Error("Your storefront status could not be loaded. Please try again.");
  }
  if (productCountResponse.error) {
    console.error("Could not load creator product listing count.", productCountResponse.error);
    throw new Error("Your product listing count could not be loaded. Please try again.");
  }
  if (activePaidProductCountResponse.error) {
    console.error("Could not load active paid product count for onboarding progress.", activePaidProductCountResponse.error);
    throw new Error("Your storefront setup progress could not be loaded. Please try again.");
  }
  if (onboardingProgressResponse.error) {
    console.error("Could not load creator onboarding progress for the dashboard.", onboardingProgressResponse.error);
    throw new Error("Your storefront setup progress could not be loaded. Please try again.");
  }
  if (salesOverviewResponse.error) {
    console.error("Could not load creator sales overview.", {
      code: salesOverviewResponse.error.code,
    });
    throw new Error("Your sales overview could not be loaded. Please try again.");
  }
  const salesOverview = formatSalesOverview(salesOverviewResponse.data);
  if (!salesOverview) {
    console.error("Creator sales overview returned an invalid response.");
    throw new Error("Your sales overview could not be loaded. Please try again.");
  }
  const storefront = storefrontResponse.data;
  const onboardingProgress = onboardingProgressResponse.data;
  const productCount = productCountResponse.count ?? 0;
  const activePaidProductCount = activePaidProductCountResponse.count ?? 0;
  const plan = creatorPlans[entitlements.plan];
  const monthlyPlanPrice = `₹${(entitlements.monthlyPricePaise / 100).toLocaleString("en-IN")}/month`;
  const cumulativeGrossSalesLimit = entitlements.cumulativeGrossSalesLimitPaise === null
    ? null
    : `₹${(entitlements.cumulativeGrossSalesLimitPaise / 100).toLocaleString("en-IN")}`;
  const checklist = completionItems(profile);
  const completed = checklist.filter((item) => item.complete).length;
  const completionPercentage = Math.round((completed / checklist.length) * 100);
  const customization = isRecord(storefront?.customization) ? storefront.customization : null;
  const socialLinks = customization?.socialLinks;
  const onboardingCompletedSteps = Array.isArray(onboardingProgress?.completed_steps)
    ? onboardingProgress.completed_steps.filter((step): step is number => typeof step === "number")
    : [];
  const onboardingCompletedCount = new Set([
    ...onboardingCompletedSteps.filter((step) => step !== 4 && step !== 7),
    ...(storefront?.store_name?.trim() && storefront.username ? [1] : []),
    ...(storefront?.profile_image_path || profile.avatar_path ? [2] : []),
    ...(storefront?.description?.trim() ? [3] : []),
    ...(activePaidProductCount > 0 ? [4] : []),
    ...(Array.isArray(socialLinks) && socialLinks.length > 0 ? [5] : []),
    ...(storefront && (
      storefront.theme !== "minimal" ||
      customization?.primaryColor !== "#2f7254" ||
      customization?.accentColor !== "#a8c9a5" ||
      customization?.backgroundColor !== "#ffffff" ||
      customization?.bannerStyle !== "wide" ||
      (Array.isArray(customization?.sectionOrder) &&
        customization.sectionOrder.some((section, index) =>
          section !== ["about", "products", "social", "contact"][index],
        )) ||
      (Array.isArray(customization?.hiddenSections) && customization.hiddenSections.length > 0)
    )
      ? [6]
      : []),
    ...(storefront?.status === "published" ? [7] : []),
  ]).size;
  const showOnboardingCard = Boolean(
    onboardingProgress &&
    !onboardingProgress.completed_at &&
    storefront?.status !== "published",
  );
  const storefrontStatus = storefront?.status === "published"
    ? "Published"
    : storefront?.status === "deletion_pending"
      ? "Deletion scheduled"
      : storefront
        ? "Draft"
        : "Not set up";
  let razorpayNeedsAttention = false;
  if (storefront?.status === "published") {
    const admin = createSupabaseAdminClient();
    const environment = getRazorpayOAuthMode();
    if (!admin || !environment) {
      razorpayNeedsAttention = true;
    } else {
      const { data: connection, error } = await admin
        .from("creator_razorpay_connections")
        .select("application_key,commission_rate,connection_status,token_expires_at")
        .eq("creator_id", user.id)
        .eq("environment", environment)
        .maybeSingle();
      if (error) {
        console.error("Could not check the published storefront's Razorpay connection.", {
          code: error.code,
        });
        throw new Error("Your Razorpay connection status could not be checked. Please try again.");
      }

      const expectedApplication = selectRazorpayApplication(
        entitlements.plan,
        entitlements.platformFeePercentage,
        entitlements.founderStatus,
      );
      const checkoutConnectionStatus = await getRazorpayCheckoutConnectionStatus(user.id, environment);
      razorpayNeedsAttention = !connection ||
        connection.connection_status !== "connected" ||
        checkoutConnectionStatus !== "connected" ||
        !expectedApplication ||
        connection.application_key !== expectedApplication ||
        connection.commission_rate !== (expectedApplication === "FOUR_PERCENT" ? 4 : 0);
    }
  }
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
      {razorpayNeedsAttention ? (
        <p className="dashboard-message dashboard-message-warning" role="status">
          Your storefront is published, but Razorpay is disconnected or needs reconnection.{" "}
          <Link href="/dashboard/settings">Go to Settings to connect or reconnect Razorpay</Link> before accepting payments.
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
          <p>{entitlements.platformFeePercentage}% effective CloverLoop platform transaction fee</p>
          <p>
            {entitlements.paidProductLimit === null ? "Unlimited paid" : `${entitlements.paidProductLimit} paid`} and{" "}
            {entitlements.freeProductLimit === null ? "unlimited free" : `${entitlements.freeProductLimit} free`} product listings
            {entitlements.plan === "free" ? " (free product allowance is lifetime)" : ""}.
          </p>
          <p>
            {cumulativeGrossSalesLimit
              ? `Cumulative Gross Sales limit: ${cumulativeGrossSalesLimit} per creator account lifetime. Upgrade to Creator to continue selling after reaching the limit.`
              : "No cumulative Gross Sales limit."}
          </p>
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
