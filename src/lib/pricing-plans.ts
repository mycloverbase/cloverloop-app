export const pricingPlans = [
  {
    id: "free",
    name: "Free",
    monthlyCost: 0,
    price: "₹0",
    fee: "0%",
    feeDetails:
      "0% on the first ₹10,000 in Gross Sales per calendar month; 4% only on incremental Gross Sales above ₹10,000.",
    calculatorFee: "0% up to ₹10,000; 4% above",
    platformFee: (grossSales: number) => Math.max(0, grossSales - 10_000) * 0.04,
    description: "A zero-cost way to start offering a small digital product catalogue.",
    features: [
      "1 paid product and 5 free products (lifetime account-level limit)",
      "₹10,000 Gross Sales allowance per calendar month, resetting on the first day (IST)",
      "Sales continue after the allowance; they are not stopped",
    ],
  },
  {
    id: "creator",
    name: "Creator",
    monthlyCost: 0,
    price: "₹0",
    fee: "4%",
    feeDetails: "4% of Gross Sales; no monthly Gross Sales limit.",
    calculatorFee: "4%",
    platformFee: (grossSales: number) => grossSales * 0.04,
    description: "Recommended for creators building a regular digital product business.",
    features: ["Unlimited paid and free product listings", "No monthly Gross Sales limit"],
    recommended: true,
  },
  {
    id: "pro-creator",
    name: "Pro Creator",
    monthlyCost: 1499,
    price: "₹1,499",
    fee: "2.5%",
    feeDetails: "2.5% of Gross Sales; no monthly Gross Sales limit.",
    calculatorFee: "2.5%",
    platformFee: (grossSales: number) => grossSales * 0.025,
    description: "For established, higher-volume creators who want a lower platform rate.",
    features: ["Unlimited paid and free product listings", "No monthly Gross Sales limit"],
  },
];

export type PricingPlan = (typeof pricingPlans)[number];
