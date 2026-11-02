import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { TrackLink } from "@/components/track-link";
import { Breadcrumbs } from "@/components/site-header";

const plans = [
  {
    name: "Free",
    price: "₹0",
    cadence: "/month",
    fee: "0%",
    description: "For creators getting started and testing their digital products.",
    ctaLabel: "Start Free Plan",
    features: ["1 paid product", "5 free product listings"],
  },
  {
    name: "Creator",
    price: "₹0",
    cadence: "/month",
    fee: "4%",
    description: "For independent creators building a regular digital product business.",
    ctaLabel: "Start Creator Plan",
    features: ["Unlimited paid products", "Unlimited free products"],
  },
  {
    name: "Pro Creator",
    price: "₹5,000",
    cadence: "/month",
    fee: "3%",
    description: "For established creators selling at scale and looking for lower transaction fees.",
    ctaLabel: "Start Pro Creator Plan",
    features: ["Unlimited paid products", "Unlimited free products"],
  },
];

const earningsPlans = [
  {
    name: "Free",
    commission: "₹0.00",
    gst: "₹0.00",
    invoice: "₹0.00",
    settlement: "₹97.64",
    net: "₹97.64",
  },
  {
    name: "Creator",
    commission: "₹4.00",
    gst: "₹0.72",
    invoice: "₹4.72",
    settlement: "₹97.64",
    net: "₹92.92",
  },
  {
    name: "Pro Creator",
    commission: "₹3.00",
    gst: "₹0.54",
    invoice: "₹3.54",
    settlement: "₹97.64",
    net: "₹94.10",
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
            the platform transaction fee that fits your business. Plan prices
            and platform transaction fees are excluding GST. Platform
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
                <span className="pricing-label">Monthly plan price (excluding GST)</span>
                <p><strong>{plan.price}</strong><span>{plan.cadence}</span></p>
              </div>
              <div className="platform-fee">
                <span className="pricing-label">Platform transaction fee (excluding GST)</span>
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
        <section className="pricing-earnings" aria-labelledby="pricing-earnings-title">
          <header className="pricing-earnings-heading">
            <h2 id="pricing-earnings-title">Understand exactly what you earn from every sale.</h2>
            <p>
              Your payment gateway charges its processing fee, CloverLoop charges its platform
              commission separately, and you keep the remaining revenue.
            </p>
          </header>
          <div className="pricing-earnings-grid" aria-label="Breakdown of a ₹100 product sale by plan">
            {earningsPlans.map((plan) => (
              <article className="pricing-earnings-card" key={plan.name}>
                <h3>{plan.name}</h3>
                <p className="pricing-earnings-caption">On a ₹100 product sale</p>
                <dl>
                  <div><dt>Product selling price</dt><dd>₹100.00</dd></div>
                  <div><dt>Razorpay processing fee (2.36%)</dt><dd>₹2.36</dd></div>
                  <div><dt>CloverLoop commission (excl. GST)</dt><dd>{plan.commission}</dd></div>
                  <div><dt>GST on commission (18%)</dt><dd>{plan.gst}</dd></div>
                  <div><dt>Monthly commission invoice allocation (incl. GST)</dt><dd>{plan.invoice}</dd></div>
                  <div><dt>Amount settled by Razorpay</dt><dd>{plan.settlement}</dd></div>
                  <div className="pricing-net-earnings">
                    <dt>Net earnings after all fees (including GST)</dt><dd>{plan.net}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <p className="pricing-earnings-note">
            Razorpay processing fees are charged separately. CloverLoop calculates its platform
            commission on successful paid transactions and invoices it monthly. GST at 18% is
            applied to the platform commission.
          </p>
          <p className="pricing-earnings-accounting">
            Razorpay settles ₹97.64 for every ₹100 sale after the 2.36% processing fee. The
            CloverLoop invoice allocation is ₹0.00, ₹4.72 or ₹3.54 depending on plan and is not
            deducted from the customer payment. Pro Creator&apos;s ₹5,000 monthly subscription
            (excluding GST) is separate and is not included in this per-sale example.
          </p>
          <p className="pricing-comparison-link">
            Comparing platforms? <Link href="/compare">Explore our platform comparison guides.</Link>
          </p>
        </section>
      </section>
    </>
  );
}
