import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { TrackLink } from "@/components/track-link";
import { Breadcrumbs } from "@/components/site-header";

const plans = [
  {
    name: "Free",
    price: "₹0",
    cadence: "/month",
    fee: "0%",
    description: "Start with a simple storefront plan.",
    ctaLabel: "Start Free Plan",
    features: ["1 paid product", "5 free product listings"],
  },
  {
    name: "Creator",
    price: "₹0",
    cadence: "/month",
    fee: "3%",
    description: "Offer more of what you create.",
    ctaLabel: "Start Creator Plan",
    features: ["Unlimited paid products", "Unlimited free products", "Unlimited free product downloads"],
  },
  {
    name: "Pro Creator",
    price: "₹10,000",
    cadence: "/month",
    fee: "2%",
    description: "A lower platform transaction fee.",
    ctaLabel: "Start Pro Creator Plan",
    features: ["Unlimited paid products", "Unlimited free products", "Unlimited free product downloads"],
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
            Choose a plan based on the number of products you want to offer and
            the platform transaction fee that fits your business. Platform
            commissions apply to successful paid transactions and are invoiced
            monthly. Razorpay processing charges are additional.
          </p>
        </header>
        <div className="pricing-grid" aria-label="CloverLoop plans">
          {plans.map((plan) => (
            <article className={`pricing-card ${plan.name === "Creator" ? "pricing-card-featured" : ""}`} key={plan.name}>
              <div className="pricing-card-title">
                <h2>{plan.name}</h2>
              </div>
              <p className="plan-description">{plan.description}</p>
              <div className="plan-price">
                <span className="pricing-label">Monthly plan price</span>
                <p><strong>{plan.price}</strong><span>{plan.cadence}</span></p>
              </div>
              <div className="platform-fee">
                <span className="pricing-label">Platform transaction fee</span>
                <p><strong>{plan.fee}</strong><span>on successful paid transactions</span></p>
              </div>
              <TrackLink
                href="/signup"
                event="pricing_cta_click"
                eventValue={plan.name}
                className={`button ${plan.name === "Creator" ? "" : "button-secondary"}`}
              >
                {plan.ctaLabel} <ArrowRight size={17} />
              </TrackLink>
              <div className="plan-includes">
                <h3>Plan includes</h3>
                <ul>{plan.features.map((feature) => <li key={feature}><Check size={17} />{feature}</li>)}</ul>
              </div>
            </article>
          ))}
        </div>
        <div className="pricing-notes">
          <header className="pricing-notes-heading">
            <span className="eyebrow">Clear from the start</span>
            <h2>Customer payments and platform fees stay separate</h2>
            <p>Here&apos;s how the intended payment model works.</p>
          </header>
          <div className="pricing-details-grid">
            <article className="pricing-detail-card">
              <span className="pricing-detail-number">01</span>
              <h3>Customer payments</h3>
              <p>Payments are processed through your own Razorpay account and settled by Razorpay directly to you. Razorpay processing fees are additional.</p>
            </article>
            <article className="pricing-detail-card">
              <span className="pricing-detail-number">02</span>
              <h3>Platform commission</h3>
              <p>CloverLoop calculates commission on successful paid transactions and invoices it monthly. It is not deducted from customer payments.</p>
            </article>
          </div>
          <ul className="pricing-footnotes">
            <li>Free products do not incur platform transaction commission.</li>
            <li>The Free plan includes five free product listings, with no monthly reset.</li>
          </ul>
          <div className="pricing-disclaimer">
            <p>These are the intended plan terms. Subscription billing and payment processing are not operational on this website.</p>
            <Link href="/payment-gateways" className="subtle-link">Explore the planned payment model <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>
    </>
  );
}
