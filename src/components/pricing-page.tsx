import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Breadcrumbs } from "@/components/site-header";
import { CreatorEarningsCalculator } from "@/components/creator-earnings-calculator";
import { LaunchChecklistForm } from "@/components/launch-checklist-form";
import { TrackLink } from "@/components/track-link";
import { pricingPlans } from "@/lib/pricing-plans";
import { resourceCards } from "@/lib/site";

const pricingFaqs = [
  {
    question: "What payment-provider fee should I enter?",
    answer: "Enter the rate in your payment-provider agreement. The 2.36% default is illustrative only; actual charges can vary by payment method, merchant terms, eligibility, promotions and applicable taxes.",
  },
  {
    question: "Are payment-provider fees included in CloverLoop pricing?",
    answer: "No. Payment-provider charges are separate from CloverLoop platform fees and are payable under the provider's terms.",
  },
  {
    question: "Does the calculator include GST and income tax?",
    answer: "No. It does not calculate GST or income tax on your sales, tax on provider fees, refunds, chargebacks, failed payments, currency conversion or other operating expenses.",
  },
  {
    question: "How is the CloverLoop platform fee calculated?",
    answer: "Free is 0% on the first ₹10,000 of Gross Sales per calendar month and 4% only on incremental Gross Sales above that allowance. The allowance resets on the first day of each calendar month (IST), and sales are not stopped after it is used. Creator is 4% and Pro Creator is 2.5% of Gross Sales.",
  },
  {
    question: "What is the difference between Free, Creator and Pro Creator?",
    answer: "Free costs ₹0/month and includes one paid product listing and five free product listings per account lifetime. Creator costs ₹0/month with a 4% platform fee and unlimited paid and free listings. Pro Creator costs ₹1,499/month with a 2.5% platform fee and unlimited paid and free listings. Provider processing charges are separate.",
  },
  {
    question: "Does the calculator show guaranteed earnings?",
    answer: "No. It is an estimate of selected costs only, not a promise of sales, income or profit. Actual outcomes depend on sales, costs, taxes and other factors.",
  },
];

const calculatorSteps = [
  "Gross sales = product price × number of sales.",
  "Payment fee = gross sales × your provider fee.",
  "Platform fee = gross sales × selected plan rate (Free applies 4% only above its monthly allowance).",
  "Estimated amount after selected costs = gross sales minus provider fee, platform fee and monthly plan charge.",
];

const guideSlugs = [
  "accept-upi-payments-digital-products-razorpay",
  "do-you-need-gst-registration-to-sell-online",
  "how-many-sales-to-hit-your-income-goal",
];

export function PricingPage() {
  const guides = guideSlugs
    .map((slug) => resourceCards.find((resource) => resource.slug === slug))
    .filter((resource): resource is (typeof resourceCards)[number] => Boolean(resource));

  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Pricing" }]} />
      <section className="pricing-page page-width">
        <header className="pricing-intro">
          <span className="eyebrow">Transparent pricing</span>
          <h1>Plans that grow with your digital products</h1>
          <p>
            Choose the product allowance and platform transaction fee that fit your business.
            Payment-provider processing charges are separate and payable by creators to their
            provider; they are not included in CloverLoop&apos;s platform commission.
          </p>
        </header>
        <div className="pricing-grid" aria-label="CloverLoop plans">
          {pricingPlans.map((plan) => (
            <article
              className={`pricing-card ${"recommended" in plan && plan.recommended ? "pricing-card-featured" : ""}`}
              key={plan.id}
            >
              <div className="pricing-card-title">
                <h2>{plan.name}</h2>
                {"recommended" in plan && plan.recommended && <span className="plan-badge">Recommended</span>}
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
                className={`button ${"recommended" in plan && plan.recommended ? "" : "button-secondary"}`}
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

        <section className="earnings-calculator-section" id="earnings-calculator" aria-labelledby="calculator-title">
          <header className="section-heading">
            <span className="eyebrow">Creator earnings calculator</span>
            <h2 id="calculator-title">Estimate selected monthly costs</h2>
            <p>Adjust the inputs to see gross sales and estimated deductions update immediately.</p>
          </header>
          <CreatorEarningsCalculator />
          <div className="calculator-disclaimer">
            <p>Estimates only. Actual payment-provider charges depend on your payment method, merchant agreement and applicable taxes. This estimate excludes taxes on your own sales, income tax, refunds, chargebacks and other operating expenses.</p>
            <h3>We&apos;re not tax consultants.</h3>
            <p>Use your provider&apos;s current terms and consult a qualified tax professional about your circumstances. The estimate is not a profit calculation or a guarantee of sales or earnings.</p>
          </div>
        </section>

        <section className="calculator-how-it-works" aria-labelledby="calculator-how-title">
          <header className="section-heading">
            <span className="eyebrow">How it works</span>
            <h2 id="calculator-how-title">Four steps behind the estimate</h2>
          </header>
          <ol className="calculator-steps">
            {calculatorSteps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}
          </ol>
        </section>

        <section className="pricing-earnings" aria-labelledby="pricing-earnings-title">
          <header className="pricing-earnings-heading">
            <h2 id="pricing-earnings-title">How the Free plan&apos;s monthly allowance works</h2>
            <p>
              The 4% Free-plan commission applies only to Gross Sales above ₹10,000 in a calendar month,
              not to the full month&apos;s sales.
            </p>
          </header>
          <p className="pricing-earnings-accounting">
            The allowance resets on the first day of each calendar month (IST). Sales are not stopped
            when the allowance is used. Payment-provider charges and applicable taxes are separate.
          </p>
        </section>

        <section className="pricing-faq-section" aria-labelledby="pricing-faq-title">
          <header className="section-heading">
            <span className="eyebrow">Pricing FAQ</span>
            <h2 id="pricing-faq-title">Questions about fees and estimates</h2>
          </header>
          <div className="faq-list">
            {pricingFaqs.map((item) => (
              <details className="faq-item" key={item.question}>
                <summary>{item.question}</summary><p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="launch-checklist-section" aria-labelledby="launch-checklist-title">
          <div className="launch-checklist-copy">
            <span className="eyebrow">Free launch checklist</span>
            <h2 id="launch-checklist-title">Make a practical plan for your first launch</h2>
            <p>Get a practical checklist to help you choose an offer, price it, prepare your files and plan your first launch.</p>
          </div>
          <LaunchChecklistForm />
        </section>

        <section className="pricing-guides-section" aria-labelledby="pricing-guides-title">
          <header className="landing-resource-heading"><div><span className="eyebrow">Pricing guides</span><h2 id="pricing-guides-title">Make informed decisions as you grow</h2></div></header>
          <div className="resource-card-grid">
            {guides.map((guide) => (
              <Link href={`/resources/${guide.slug}`} className="resource-card" key={guide.slug}>
                <span className="eyebrow">{guide.category}</span>
                <h3>{guide.title}</h3>
                <p>{guide.description}</p>
                <span className="resource-card-link">Read the guide <ArrowRight size={15} /></span>
              </Link>
            ))}
          </div>
        </section>
      </section>
    </>
  );
}
