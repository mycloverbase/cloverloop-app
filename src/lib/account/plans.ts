import type { CreatorPlanKey } from "@/lib/account/types";

export const creatorPlans: Record<
  CreatorPlanKey,
  { name: string; monthlyPrice: string; commission: string; features: string[] }
> = {
  free: {
    name: "Free",
    monthlyPrice: "₹0/month",
    commission: "0% platform transaction fee",
    features: ["1 paid product and 5 free product listings per account lifetime"],
  },
  creator: {
    name: "Creator",
    monthlyPrice: "₹0/month",
    commission: "4% of Gross Sales",
    features: ["Unlimited paid and free product listings", "No monthly Gross Sales limit"],
  },
  pro_creator: {
    name: "Pro Creator",
    monthlyPrice: "₹2,999/month",
    commission: "0% platform transaction fee",
    features: ["Unlimited paid and free product listings", "No monthly Gross Sales limit"],
  },
};

export function getCreatorPlan(value: unknown): CreatorPlanKey {
  return value === "creator" || value === "pro_creator" ? value : "free";
}
