import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreatorPlanKey } from "@/lib/account/types";

export type CreatorEntitlements = {
  plan: CreatorPlanKey;
  monthlyPricePaise: number;
  platformFeePercentage: number;
  paidProductLimit: number | null;
  freeProductLimit: number | null;
  monthlyGrossSalesLimitPaise: number | null;
  founderAllocationNumber: number | null;
  founderActivatedAt: string | null;
  founderExpiresAt: string | null;
  founderStatus: "active" | "expired" | null;
  subscriptionStatus: string | null;
  nextBillingAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function getMyPlanEntitlements(
  supabase: SupabaseClient,
): Promise<CreatorEntitlements> {
  const { data, error } = await supabase.rpc("get_my_plan_entitlements");
  if (error) {
    console.error("Could not load creator plan entitlements.", error);
    throw new Error("Your plan details could not be loaded. Please try again.");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (
    !isRecord(row) ||
    (row.plan_key !== "free" && row.plan_key !== "creator" && row.plan_key !== "pro_creator") ||
    typeof row.monthly_price_paise !== "number" ||
    typeof row.platform_fee_percentage !== "number"
  ) {
    console.error("The creator plan entitlement response was invalid.");
    throw new Error("Your plan details could not be loaded. Please try again.");
  }
  return {
    plan: row.plan_key as CreatorPlanKey,
    monthlyPricePaise: row.monthly_price_paise,
    platformFeePercentage: row.platform_fee_percentage,
    paidProductLimit: numberOrNull(row.paid_product_limit),
    freeProductLimit: numberOrNull(row.free_product_limit),
    monthlyGrossSalesLimitPaise: numberOrNull(row.monthly_gross_sales_limit_paise),
    founderAllocationNumber: numberOrNull(row.founder_allocation_number),
    founderActivatedAt: textOrNull(row.founder_activated_at),
    founderExpiresAt: textOrNull(row.founder_expires_at),
    founderStatus: row.founder_status === "active" || row.founder_status === "expired"
      ? row.founder_status
      : null,
    subscriptionStatus: textOrNull(row.subscription_status),
    nextBillingAt: textOrNull(row.next_billing_at),
  };
}
