import type { Metadata } from "next";
import { getAvatarSignedUrl, getCreatorName, requireCreatorContext } from "@/lib/account/server";
import { getMyPlanEntitlements } from "@/lib/account/entitlements";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import {
  getRazorpayOAuthMode,
  selectRazorpayApplication,
} from "@/lib/razorpay/oauth";
import { getRazorpayCheckoutConnectionStatus } from "@/lib/razorpay/checkout";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatSalesOverview, parseSalesOverviewPeriod } from "@/lib/dashboard/sales-overview";

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
    reviewSummaryResponse,
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
    supabase.rpc("get_my_product_review_summary"),
  ]);
  const reviewSummaryRow = Array.isArray(reviewSummaryResponse.data) ? reviewSummaryResponse.data[0] : null;
  if (reviewSummaryResponse.error) {
    console.error("Could not load the creator review summary.", { code: reviewSummaryResponse.error.code });
  }
  const reviewSummary = reviewSummaryRow && typeof reviewSummaryRow === "object"
    ? {
        count: Number(reviewSummaryRow.review_count) || 0,
        average: reviewSummaryRow.average_rating === null ? null : Number(reviewSummaryRow.average_rating),
      }
    : null;
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
  const checklist = completionItems(profile);
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
  return (
    <DashboardOverview
      name={name}
      avatarUrl={avatarUrl}
      storefront={storefront ? { status: storefront.status, username: storefront.username } : null}
      referralStatus={referralStatus}
      razorpayNeedsAttention={razorpayNeedsAttention}
      showOnboardingCard={showOnboardingCard}
      onboardingCompletedCount={onboardingCompletedCount}
      salesPeriod={salesPeriod}
      salesOverview={salesOverview}
      entitlements={entitlements}
      profileUsername={profileUsername}
      profileBio={profile.bio}
      productCount={productCount}
      usernameMessage={usernameMessage}
      checklist={checklist}
      reviewSummary={reviewSummary}
    />
  );
}
