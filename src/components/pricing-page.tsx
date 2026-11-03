import { ArrowRight, Check } from "lucide-react";
import { TrackLink } from "@/components/track-link";
import { Breadcrumbs } from "@/components/site-header";

const plans = [
  {
    name: "Free",
    price: "₹0",
    fee: "0%",
    feeDetails: "0% on the first ₹10,000 in Gross Sales per calendar month; 4% only on incremental Gross Sales above ₹10,000.",
    description: "A zero-cost way to start offering a small digital product catalogue.",
    features: [
      "1 paid product and 5 free products (lifetime account-level limit)",
      "₹10,000 Gross Sales allowance per calendar month, resetting on the first day (IST)",
      "Sales continue after the allowance; they are not stopped",
    ],
  },
  {
    name: "Creator",
    price: "₹0",
    fee: "4%",
    feeDetails: "4% of Gross Sales; no monthly Gross Sales limit.",
    description: "Recommended for creators building a regular digital product business.",
    features: [
      "Unlimited paid and free product listings",
      "No monthly Gross Sales limit",
    ],
    recommended: true,
  },
  {
    name: "Pro Creator",
    price: "₹1,499",
    fee: "2.5%",
    feeDetails: "2.5% of Gross Sales; no monthly Gross Sales limit.",
    description: "For established, higher-volume creators who want a lower platform rate.",
    features: [
      "Unlimited paid and free product listings",
      "No monthly Gross Sales limit",
    ],
  },
];

export function PricingPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Pricing" }]} />
      <section className="pricing-page page-width">
        <header className="pricing-intro">
          <span className="eyebrow">Transparent pricing</span>
          <h1>Plans that grow with your digital products</h1>
          <p>
            Choose the product allowance and platform transaction fee that fit your business.
            Payment gateway processing charges are separate and payable by creators to their
            provider; they are not included in CloverLoop&apos;s platform commission.
          </p>
        </header>
        <div className="pricing-grid" aria-label="CloverLoop plans">
          {plans.map((plan) => (
            <article
              className={`pricing-card ${plan.recommended ? "pricing-card-featured" : ""}`}
              key={plan.name}
            >
              <div className="pricing-card-title">
                <h2>{plan.name}</h2>
                {plan.recommended && <span className="plan-badge">Recommended</span>}
              </div>
              <p className="plan-description">{plan.description}</p>
              <div className="plan-price">
                <span className="pricing-label">Monthly plan price (excluding applicable GST)</span>
                <p><strong>{plan.price}</strong><span>/month</span></p>
              </div>
              <div className="platform-fee">
                <span className="pricing-label">Platform transaction fee</span>
                <p><strong>{plan.fee}</strong></p>
                <p className="platform-fee-details">{plan.feeDetails}</p>
              </div>
              <TrackLink
                href="/signup"
                event="pricing_cta_click"
                eventValue={plan.name}
                className={`button ${plan.recommended ? "" : "button-secondary"}`}
              >
                Create an account <ArrowRight size={17} />
              </TrackLink>
              <div className="plan-includes">
                <h3>Plan includes</h3>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}><Check size={17} />{feature}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
        <section className="pricing-earnings" aria-labelledby="pricing-earnings-title">
          <header className="pricing-earnings-heading">
            <h2 id="pricing-earnings-title">How the Free plan&apos;s monthly allowance works</h2>
            <p>
              The 4% Free-plan commission applies only to Gross Sales above ₹10,000 in a calendar month,
              not to the full month&apos;s sales.
            </p>
          </header>
          <article className="pricing-earnings-card pricing-example-card">
            <h3>Example: ₹15,000 monthly Gross Sales</h3>
            <dl>
              <div><dt>First ₹10,000 of Gross Sales</dt><dd>0% commission</dd></div>
              <div><dt>Incremental ₹5,000 above the allowance</dt><dd>4% = ₹200</dd></div>
            </dl>
            <p className="pricing-earnings-note">
              Applicable GST, if any, is additional. Sales continue after the allowance is used;
              they are not stopped. The ₹10,000 allowance resets on the first day of each calendar
              month (IST).
            </p>
          </article>
          <p className="pricing-earnings-accounting">
            Razorpay or another payment provider may charge separate processing fees, payable by
            the creator under that provider&apos;s terms. These charges are not included in
            CloverLoop&apos;s platform commission.
          </p>
        </section>
      </section>
    </>
  );
}
