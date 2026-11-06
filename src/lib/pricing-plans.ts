export const pricingPlans = [
  {
    id: "free",
    name: "Free",
    monthlyCost: 0,
    price: "₹0",
    fee: "0%",
    feeDetails: "0% platform fee on all Gross Sales.",
    calculatorFee: "0%",
    platformFee: (grossSales: number) => grossSales * 0,
    description: "A simple way to start offering a small digital product catalogue.",
    features: [
      "1 paid product and 5 free products (lifetime account-level limit)",
    ],
  },
  {
    id: "creator",
    name: "Creator",
    monthlyCost: 0,
    price: "₹0",
    fee: "4%",
    feeDetails: "4% of Gross Sales.",
    calculatorFee: "4%",
    platformFee: (grossSales: number) => grossSales * 0.04,
    description: "Recommended for creators building a regular digital product business.",
    features: ["Unlimited paid and free product listings", "No monthly Gross Sales limit"],
    recommended: true,
  },
  {
    id: "pro-creator",
    name: "Pro Creator",
    monthlyCost: 2999,
    price: "₹2,999",
    fee: "0%",
    feeDetails: "0% platform fee on all Gross Sales.",
    calculatorFee: "0%",
    platformFee: (grossSales: number) => grossSales * 0,
    description: "For creators who prefer a 0% platform fee with a monthly plan.",
    features: ["Unlimited paid and free product listings", "No monthly Gross Sales limit"],
  },
];

export type PricingPlan = (typeof pricingPlans)[number];
