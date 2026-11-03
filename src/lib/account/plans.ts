import type { CreatorPlanKey } from "@/lib/account/types";

export const creatorPlans: Record<
  CreatorPlanKey,
  { name: string; monthlyPrice: string; commission: string; features: string[] }
> = {
  free: {
    name: "Free",
    monthlyPrice: "₹0/month",
    commission: "0% on the first ₹10,000 in Gross Sales per calendar month; 4% on incremental Gross Sales above ₹10,000",
    features: [
      "1 paid product and 5 free product listings per account lifetime",
      "The monthly allowance resets on the first day of each calendar month (IST)",
      "Sales continue after the allowance is used",
    ],
  },
  creator: {
    name: "Creator",
    monthlyPrice: "₹0/month",
    commission: "4% of Gross Sales, with no monthly Gross Sales limit",
    features: ["Unlimited paid and free product listings", "No monthly Gross Sales limit"],
  },
  pro_creator: {
    name: "Pro Creator",
    monthlyPrice: "₹1,499/month",
    commission: "2.5% of Gross Sales, with no monthly Gross Sales limit",
    features: ["Unlimited paid and free product listings", "No monthly Gross Sales limit"],
  },
};

export function getCreatorPlan(value: unknown): CreatorPlanKey {
  return value === "creator" || value === "pro_creator" ? value : "free";
}
