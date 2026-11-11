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
    if (error) console.error("Could not verify the founding programme administrator.", error);
    return null;
  }
  return supabase;
}

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function overrideFounderAttributionAction(formData: FormData) {
  const creatorId = formText(formData, "creator_id");
  const source = formText(formData, "source");
  const reason = formText(formData, "reason");
  if (!creatorIdPattern.test(creatorId) || !["founder", "removed"].includes(source) || reason.length < 5 || reason.length > 500) {
    redirect("/dashboard/admin/founding-creators?result=invalid");
  }
  const supabase = await getAdminClient();
  if (!supabase) redirect("/dashboard?error=admin");
  const { error } = await supabase.rpc("admin_override_founder_attribution", {
    requested_creator_id: creatorId,
    requested_source: source,
    requested_reason: reason,
  });
  if (error) {
    console.error("Could not update founder referral attribution.", error);
    redirect("/dashboard/admin/founding-creators?result=failed");
  }
  revalidatePath("/dashboard/admin/founding-creators");
  redirect("/dashboard/admin/founding-creators?result=attribution-updated");
}

export async function manuallyEnrolFounderCreatorAction(formData: FormData) {
  const creatorId = formText(formData, "creator_id");
  const reason = formText(formData, "reason");
  if (!creatorIdPattern.test(creatorId) || reason.length < 5 || reason.length > 500) {
    redirect("/dashboard/admin/founding-creators?result=invalid");
  }
  const supabase = await getAdminClient();
  if (!supabase) redirect("/dashboard?error=admin");
  const { data, error } = await supabase.rpc("admin_enrol_founding_creator", {
    requested_creator_id: creatorId,
    requested_reason: reason,
  });
  if (error || typeof data !== "number") {
    if (error) console.error("Could not manually enrol a Founding Creator.", error);
    redirect("/dashboard/admin/founding-creators?result=enrolment-failed");
  }
  revalidatePath("/dashboard/admin/founding-creators");
  redirect(`/dashboard/admin/founding-creators?result=enrolled&allocation=${data}`);
}
