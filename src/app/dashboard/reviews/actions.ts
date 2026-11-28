"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reasons = new Set(["spam", "offensive", "fraudulent", "not_about_product", "other"]);

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function reportReviewAction(formData: FormData) {
  const reviewId = formText(formData, "review_id");
  const reason = formText(formData, "reason");
  const details = formText(formData, "details");
  if (!uuidPattern.test(reviewId) || !reasons.has(reason) || details.length > 1000) {
    redirect("/dashboard/reviews?report=invalid");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/dashboard/reviews?report=failed");
  const { error } = await supabase.rpc("report_product_review", {
    p_review_id: reviewId,
    p_reason: reason,
    p_details: details,
  });
  if (error) {
    console.error("A creator review report could not be saved.", { code: error.code });
    redirect("/dashboard/reviews?report=failed");
  }
  revalidatePath("/dashboard/reviews");
  redirect("/dashboard/reviews?report=sent");
}
