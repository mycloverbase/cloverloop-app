"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const creatorIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getAdminClient() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || user.app_metadata?.role !== "admin") {
    if (error) console.error("Could not verify the dashboard administrator.", error);
    return null;
  }
  return supabase;
}

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function lookupCreatorByEmailAction(formData: FormData) {
  const email = formText(formData, "creator_email").toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false as const, message: "Enter the creator's registered email address." };
  }
  const supabase = await getAdminClient();
  if (!supabase) {
    return { ok: false as const, message: "Admin access could not be verified. Sign in again." };
  }

  const { data, error } = await supabase.rpc("admin_lookup_creator_context_by_email", {
    requested_creator_email: email,
  });
  if (error) {
    console.error("Could not look up a creator for admin actions.", { code: error.code });
    return {
      ok: false as const,
      message: "Creator details could not be loaded. Confirm the admin context lookup migration is applied.",
    };
  }
  if (!Array.isArray(data)) {
    console.error("The storefront recovery lookup returned invalid data.");
    return { ok: false as const, message: "Creator details could not be loaded. Please try again." };
  }
  const row: unknown = data[0];
  if (row === undefined) return { ok: true as const, creator: null };
  if (
    !isRecord(row) ||
    typeof row.creator_id !== "string" ||
    typeof row.creator_email !== "string" ||
    (row.profile_name !== null && typeof row.profile_name !== "string") ||
    (row.storefront_id !== null && typeof row.storefront_id !== "string") ||
    (row.storefront_name !== null && typeof row.storefront_name !== "string") ||
    (row.username !== null && typeof row.username !== "string") ||
    (row.storefront_status !== null && typeof row.storefront_status !== "string") ||
    (row.deleted_at !== null && typeof row.deleted_at !== "string") ||
    (row.delete_after !== null && typeof row.delete_after !== "string") ||
    typeof row.can_restore !== "boolean" ||
    (row.plan_key !== "free" && row.plan_key !== "creator" && row.plan_key !== "pro_creator") ||
    (row.founder_status !== null && row.founder_status !== "active" && row.founder_status !== "expired") ||
    (row.subscription_status !== null && typeof row.subscription_status !== "string")
  ) {
    console.error("The admin creator lookup returned an invalid creator record.");
    return { ok: false as const, message: "Creator details could not be loaded. Please try again." };
  }
  return {
    ok: true as const,
    creator: {
      creatorId: row.creator_id,
      email: row.creator_email,
      profileName: row.profile_name,
      storefrontId: row.storefront_id,
      storefrontName: row.storefront_name,
      username: row.username,
      storefrontStatus: row.storefront_status,
      deletedAt: row.deleted_at,
      deleteAfter: row.delete_after,
      canRestore: row.can_restore,
      currentPlan: row.plan_key,
      founderStatus: row.founder_status,
      subscriptionStatus: row.subscription_status,
    },
  };
}

export async function changeCreatorPlanAction(formData: FormData) {
  const creatorId = formText(formData, "creator_id");
  const plan = formText(formData, "plan");
  const reason = formText(formData, "reason");
  if (
    !creatorIdPattern.test(creatorId) ||
    !["free", "creator", "founding_creator"].includes(plan) ||
    reason.length < 5 ||
    reason.length > 500
  ) {
    redirect("/dashboard/admin/plans?result=invalid");
  }
  const supabase = await getAdminClient();
  if (!supabase) redirect("/dashboard?error=admin");

  if (plan === "founding_creator") {
    const { data, error } = await supabase.rpc("admin_set_founding_creator_entitlement", {
      requested_creator_id: creatorId,
      requested_action: "add",
      requested_reason: reason,
    });
    if (error) {
      console.error("Could not enrol a creator in the Founding Creator programme.", error);
      redirect("/dashboard/admin/plans?result=founder-failed");
    }
    if (data !== "added") {
      redirect(`/dashboard/admin/plans?result=founder-${typeof data === "string" ? data : "failed"}`);
    }
    revalidatePath("/dashboard/admin/plans");
    revalidatePath("/dashboard/admin/founding-creators");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/products");
    redirect("/dashboard/admin/plans?result=founder-enrolled");
  }

  const { data, error } = await supabase.rpc("admin_change_creator_plan", {
    requested_creator_id: creatorId,
    requested_plan: plan,
    requested_reason: reason,
  });
  if (error) {
    console.error("Could not change a creator's plan.", error);
    redirect(`/dashboard/admin/plans?result=${error.code === "0A000" ? "subscription-managed" : "failed"}`);
  }
  if (data !== "updated" && data !== "unchanged") {
    console.error("The admin plan change returned an invalid result.");
    redirect("/dashboard/admin/plans?result=failed");
  }
  revalidatePath("/dashboard/admin/plans");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/products");
  redirect(`/dashboard/admin/plans?result=${data}`);
}

export async function changeFoundingCreatorEntitlementAction(formData: FormData) {
  const creatorId = formText(formData, "creator_id");
  const action = formText(formData, "action");
  const reason = formText(formData, "reason");
  if (!creatorIdPattern.test(creatorId) || !["add", "remove"].includes(action) || reason.length < 5 || reason.length > 500) {
    redirect("/dashboard/admin/founding-creators?result=invalid");
  }
  const supabase = await getAdminClient();
  if (!supabase) redirect("/dashboard?error=admin");
  const { data, error } = await supabase.rpc("admin_set_founding_creator_entitlement", {
    requested_creator_id: creatorId,
    requested_action: action,
    requested_reason: reason,
  });
  if (error) {
    console.error("Could not change a Founding Creator entitlement.", error);
    redirect("/dashboard/admin/founding-creators?result=failed");
  }
  if (
    typeof data !== "string" ||
    !["added", "removed", "already_active", "not_active", "capacity_reached", "subscription_managed", "not_found"].includes(data)
  ) {
    console.error("The Founding Creator entitlement action returned an invalid result.");
    redirect("/dashboard/admin/founding-creators?result=failed");
  }
  if (data === "added" || data === "removed") {
    revalidatePath("/dashboard/admin/plans");
    revalidatePath("/dashboard/admin/founding-creators");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/products");
  }
  redirect(`/dashboard/admin/founding-creators?result=${data}`);
}

export async function restoreStorefrontAction(formData: FormData) {
  const storefrontId = formText(formData, "storefront_id");
  const reason = formText(formData, "reason");
  if (!creatorIdPattern.test(storefrontId) || reason.length < 5 || reason.length > 500) {
    redirect("/dashboard/admin/storefront-recovery?result=invalid");
  }
  const supabase = await getAdminClient();
  if (!supabase) redirect("/dashboard?error=admin");
  const { data, error } = await supabase.rpc("admin_restore_storefront", {
    requested_storefront_id: storefrontId,
    requested_reason: reason,
  });
  if (error) {
    console.error("Could not restore a storefront scheduled for deletion.", error);
    redirect(`/dashboard/admin/storefront-recovery?result=${error.code === "P0001" ? "expired" : error.code === "P0002" ? "not-pending" : "failed"}`);
  }
  if (typeof data !== "string") {
    console.error("The storefront recovery function returned an invalid username.");
    redirect("/dashboard/admin/storefront-recovery?result=failed");
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/storefront");
  revalidatePath("/dashboard/admin/storefront-recovery");
  revalidatePath(`/${data}`);
  redirect("/dashboard/admin/storefront-recovery?result=restored");
}

export async function moderateProductReviewAction(formData: FormData) {
  const reviewId = formText(formData, "review_id");
  const action = formText(formData, "moderation_action");
  const note = formText(formData, "note");
  if (!creatorIdPattern.test(reviewId) || !["hide", "restore", "dismiss_reports"].includes(action) || note.length > 500) {
    redirect("/dashboard/admin/reviews?result=invalid");
  }
  const supabase = await getAdminClient();
  if (!supabase) redirect("/dashboard?error=admin");
  const { error } = await supabase.rpc("admin_moderate_product_review", {
    p_review_id: reviewId,
    p_action: action,
    p_note: note || null,
  });
  if (error) {
    console.error("Could not moderate a product review.", { code: error.code });
    redirect("/dashboard/admin/reviews?result=failed");
  }
  revalidatePath("/dashboard/admin/reviews");
  redirect(`/dashboard/admin/reviews?result=${action}`);
}
