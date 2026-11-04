"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { pricingPlans } from "@/lib/pricing-plans";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function CreatorEarningsCalculator() {
  const [price, setPrice] = useState("1000");
  const [sales, setSales] = useState("50");
  const [providerFee, setProviderFee] = useState("2.36");
  const [planId, setPlanId] = useState("creator");

  const calculation = useMemo(() => {
    const productPrice = Number(price);
    const monthlySales = Number(sales);
    const providerRate = Number(providerFee);
    const selectedPlan = pricingPlans.find((plan) => plan.id === planId) ?? pricingPlans[0];

    if (
      !Number.isFinite(productPrice) ||
      productPrice <= 0 ||
      !Number.isFinite(monthlySales) ||
      monthlySales < 0 ||
      !Number.isInteger(monthlySales) ||
      !Number.isFinite(providerRate) ||
      providerRate < 0 ||
      providerRate > 100
    ) {
      return null;
    }

    const grossSales = productPrice * monthlySales;
    const paymentProviderCost = grossSales * (providerRate / 100);
    const platformFee = selectedPlan.platformFee(grossSales);
    const estimatedAmount =
      grossSales - paymentProviderCost - platformFee - selectedPlan.monthlyCost;

    if (![grossSales, paymentProviderCost, platformFee, estimatedAmount].every(Number.isFinite)) {
      return null;
    }

    return {
      grossSales,
      paymentProviderCost,
      platformFee,
      monthlyPlanCost: selectedPlan.monthlyCost,
      estimatedAmount,
      selectedPlan,
    };
  }, [price, sales, providerFee, planId]);

  return (
    <div className="calculator-layout">
      <form className="calculator-inputs" onSubmit={(event) => event.preventDefault()}>
        <label>
          Product price (INR)
          <input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="any"
            required
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </label>
        <label>
          Sales per month
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            required
            value={sales}
            onChange={(event) => setSales(event.target.value)}
          />
        </label>
        <label>
          Payment provider fee (%)
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="any"
            required
            value={providerFee}
            onChange={(event) => setProviderFee(event.target.value)}
          />
          <span className="field-hint">Illustrative default; edit it to match your provider terms.</span>
        </label>
        <label>
          CloverLoop plan
          <select value={planId} onChange={(event) => setPlanId(event.target.value)}>
            {pricingPlans.map((plan) => (
              <option value={plan.id} key={plan.id}>
                {plan.name} — {plan.price}/month · {plan.calculatorFee}
              </option>
            ))}
          </select>
        </label>
        {calculation === null && (
          <p className="form-message form-message-error" role="alert">
            Enter a positive product price, whole-number sales of zero or more, and a provider fee from 0% to 100%. The selected values must be within the calculator&apos;s numeric range.
          </p>
        )}
      </form>

      <section className="calculator-results" aria-live="polite" aria-label="Estimated costs">
        <h3>Monthly estimate</h3>
        {calculation ? (
          <>
            <dl>
              <div><dt>Gross Sales</dt><dd>{money.format(calculation.grossSales)}</dd></div>
              <div><dt>Payment Provider Cost</dt><dd>−{money.format(calculation.paymentProviderCost)}</dd></div>
              <div><dt>CloverLoop Platform Fee</dt><dd>−{money.format(calculation.platformFee)}</dd></div>
              <div><dt>Monthly Plan Cost</dt><dd>−{money.format(calculation.monthlyPlanCost)}</dd></div>
              <div className="calculator-total"><dt>Estimated Amount After Selected Costs</dt><dd>{money.format(calculation.estimatedAmount)}</dd></div>
            </dl>
            {calculation.selectedPlan.id === "free" && (
              <p className="field-hint">
                The published Free plan rate is 0% on the first ₹10,000 of monthly Gross Sales and 4% only on the amount above it. The allowance resets each calendar month (IST).
              </p>
            )}
          </>
        ) : (
          <p>Results will appear when all values are valid.</p>
        )}
        <Link href="/compare" className="subtle-link">Compare CloverLoop with alternatives</Link>
      </section>
    </div>
  );
}
