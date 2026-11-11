"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/account/types";

async function getAuthenticatedClient() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false as const, result: { ok: false as const, message: "Plan services are not configured." } };
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    if (error) console.error("Could not verify a plan change.", error);
    return { ok: false as const, result: { ok: false as const, message: "Please sign in again to continue." } };
  }
  return { ok: true as const, supabase };
}

export async function upgradeToCreatorPlanAction(): Promise<ActionResult> {
  const auth = await getAuthenticatedClient();
  if (!auth.ok) return auth.result;
  const { data, error } = await auth.supabase.rpc("upgrade_my_creator_plan");
  if (error) {
    console.error("Could not upgrade the creator plan.", error);
    return { ok: false, message: "Your plan could not be updated. Please try again." };
  }
  if (data !== "upgraded" && data !== "already_upgraded") {
    console.error("The Creator plan upgrade returned an invalid result.");
    return { ok: false, message: "Your plan could not be updated. Please try again." };
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  return {
    ok: true,
    message: data === "upgraded" ? "Creator plan activated. Your listing limits are now unlimited." : "Your account is already on an upgraded plan.",
  };
}

export async function requestProCreatorUpgradeAction(): Promise<ActionResult> {
  const auth = await getAuthenticatedClient();
  if (!auth.ok) return auth.result;
  const { error } = await auth.supabase.rpc("upgrade_creator_to_pro");
  if (error?.code === "0A000") {
    return {
      ok: false,
      message: "Pro Creator subscriptions are not available yet because CloverLoop has not configured a payment provider.",
    };
  }
  if (error) {
    console.error("Could not start a Pro Creator upgrade.", error);
    return { ok: false, message: "Your Pro Creator upgrade could not be started. Please try again." };
  }
  console.error("The Pro Creator upgrade unexpectedly succeeded without a payment provider.");
  return { ok: false, message: "Pro Creator subscriptions are not available yet." };
}
