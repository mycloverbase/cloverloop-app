"use server";

import { revalidatePath } from "next/cache";
import { creatorAgreementIsAccepted } from "@/lib/account/creator-agreement-consent";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OnboardingProgressResult =
  | { ok: true; version: number }
  | { ok: false; message: string };

function isStepList(value: unknown): value is number[] {
  return Array.isArray(value) &&
    value.every((step) => Number.isInteger(step) && step >= 1 && step <= 7) &&
    new Set(value).size === value.length;
}

function parseVersion(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function saveCreatorOnboardingProgressAction(input: {
  currentStep: number;
  completedSteps: number[];
  skippedSteps: number[];
  version: number;
  started?: boolean;
  completed?: boolean;
}): Promise<OnboardingProgressResult> {
  if (
    !input ||
    !Number.isInteger(input.currentStep) ||
    input.currentStep < 1 ||
    input.currentStep > 7 ||
    !isStepList(input.completedSteps) ||
    !isStepList(input.skippedSteps) ||
    input.completedSteps.some((step) => input.skippedSteps.includes(step)) ||
    !Number.isSafeInteger(input.version) ||
    input.version < 0 ||
    (input.started !== undefined && typeof input.started !== "boolean") ||
    (input.completed !== undefined && typeof input.completed !== "boolean")
  ) {
    return { ok: false, message: "Your onboarding progress could not be saved. Refresh and try again." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Onboarding is not available right now." };
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    if (userError) console.error("Could not verify a creator onboarding progress update.", userError);
    return { ok: false, message: "Please sign in again to continue onboarding." };
  }
  if (!(await creatorAgreementIsAccepted(supabase))) {
    return { ok: false, message: "Accept the Creator Agreement before continuing onboarding." };
  }

  const { data, error } = await supabase.rpc("save_my_creator_onboarding_progress", {
    requested_current_step: input.currentStep,
    requested_completed_steps: input.completedSteps,
    requested_skipped_steps: input.skippedSteps,
    requested_version: input.version,
    requested_started: input.started ?? false,
    requested_completed: input.completed ?? false,
  });
  if (error) {
    if (error.code === "40001") {
      return { ok: false, message: "Your onboarding progress changed in another tab. Refresh to continue from the latest step." };
    }
    console.error("Could not save creator onboarding progress.", { code: error.code });
    return { ok: false, message: "Your onboarding progress could not be saved. Please try again." };
  }
  const version = parseVersion(data);
  if (version === null) {
    console.error("Creator onboarding progress returned an invalid version.");
    return { ok: false, message: "Your onboarding progress could not be confirmed. Refresh and try again." };
  }
  revalidatePath("/dashboard");
  return { ok: true, version };
}
