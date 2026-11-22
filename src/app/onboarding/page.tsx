import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreatorOnboardingWizard } from "@/components/onboarding/creator-onboarding-wizard";
import { getAvatarSignedUrl, getCreatorName, requireCreatorContext } from "@/lib/account/server";
import { getMyPlanEntitlements } from "@/lib/account/entitlements";
import { getCreatorStorefront, getStorefrontSubcategoryOptions } from "@/lib/storefront/server";

export const metadata: Metadata = {
  title: "Set up your storefront | CloverLoop",
  description: "Follow a guided setup to publish your CloverLoop creator storefront.",
  robots: { index: false, follow: false },
};

type OnboardingProgressRow = {
  current_step: number;
  completed_steps: number[];
  skipped_steps: number[];
  version: number;
  started_at: string | null;
  completed_at: string | null;
};

async function getListingCount(
  supabase: Awaited<ReturnType<typeof requireCreatorContext>>["supabase"],
  userId: string,
  column: "counted_as_free" | "counted_as_paid",
) {
  const { count, error } = await supabase
    .from("storefront_products")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq(column, true);
  if (error) {
    console.error("Could not load onboarding product listing usage.", error);
    throw new Error("Your product listing allowance could not be loaded. Please try again.");
  }
  return count ?? 0;
}

export default async function CreatorOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string | string[]; referral?: string | string[] }>;
}) {
  const params = await searchParams;
  const flow = Array.isArray(params.flow) ? params.flow[0] : params.flow;
  const referral = Array.isArray(params.referral) ? params.referral[0] : params.referral;
  const { supabase, user, profile } = await requireCreatorContext();

  let progressResponse = await supabase
    .from("creator_onboarding_progress")
    .select("current_step,completed_steps,skipped_steps,version,started_at,completed_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (progressResponse.error) {
    console.error("Could not load creator onboarding progress.", progressResponse.error);
    throw new Error("Your onboarding progress could not be loaded. Please try again.");
  }

  if (!progressResponse.data && flow === "signup") {
    const { error } = await supabase.rpc("initialize_my_creator_onboarding");
    if (error) {
      console.error("Could not initialize creator onboarding progress.", error);
      throw new Error("Your storefront setup could not be started. Please try again.");
    }
    progressResponse = await supabase
      .from("creator_onboarding_progress")
      .select("current_step,completed_steps,skipped_steps,version,started_at,completed_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (progressResponse.error) {
      console.error("Could not reload creator onboarding progress.", progressResponse.error);
      throw new Error("Your onboarding progress could not be loaded. Please try again.");
    }
  }

  if (!progressResponse.data) redirect("/dashboard");
  const row = progressResponse.data as OnboardingProgressRow;
  if (
    !Number.isInteger(row.current_step) ||
    row.current_step < 1 ||
    row.current_step > 7 ||
    !Number.isSafeInteger(row.version) ||
    row.version < 0 ||
    !Array.isArray(row.completed_steps) ||
    !Array.isArray(row.skipped_steps)
  ) {
    console.error("Creator onboarding progress returned an invalid response.");
    throw new Error("Your onboarding progress could not be loaded. Please contact support.");
  }

  const [storefront, entitlements, subcategoryOptions, freeListingCount, paidListingCount, avatarUrl] =
    await Promise.all([
      getCreatorStorefront(supabase, user.id),
      getMyPlanEntitlements(supabase),
      getStorefrontSubcategoryOptions(supabase),
      getListingCount(supabase, user.id, "counted_as_free"),
      getListingCount(supabase, user.id, "counted_as_paid"),
      getAvatarSignedUrl(supabase, profile.avatar_path),
    ]);

  return (
    <div className="creator-dashboard onboarding-page">
      <CreatorOnboardingWizard
        creatorName={getCreatorName(profile.display_name, user.email ?? "")}
        creatorUsername={profile.username}
        creatorBio={profile.bio}
        creatorAvatarPath={profile.avatar_path}
        creatorAvatarUrl={avatarUrl}
        initialStorefront={storefront}
        initialProgress={{
          currentStep: row.current_step,
          completedSteps: row.completed_steps,
          skippedSteps: row.skipped_steps,
          version: row.version,
          startedAt: row.started_at,
          completedAt: row.completed_at,
        }}
        subcategoryOptions={subcategoryOptions}
        paidProductLimit={entitlements.paidProductLimit}
        freeProductLimit={entitlements.freeProductLimit}
        initialPaidListingCount={paidListingCount}
        initialFreeListingCount={freeListingCount}
        referralError={referral === "save-error"}
      />
    </div>
  );
}
