import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, CreditCard, Download, Store } from "lucide-react";
import { PublicLayout } from "@/components/public-layout";
import { PublicCta } from "@/components/public-cta";
import { TrackLink } from "@/components/track-link";
import { faqItems, featurePages, resourceCards } from "@/lib/site";

const benefits = [
  {
    icon: Store,
    title: "Your own storefront",
    body: "Give your audience one clear destination to explore your digital products.",
  },
  {
    icon: Download,
    title: "Sell digital products",
    body: "Present ebooks, templates, presets, printables and other downloadable resources.",
  },
  {
    icon: CreditCard,
    title: "Your payment account",
    body: "Keep control of the payment account connected to your storefront.",
  },
  {
    icon: Check,
    title: "A clearer delivery experience",
    body: "Files are delivered after payment verification through secure download links.",
  },
];

export default function HomePage() {
  return (
    <PublicLayout>
      <section className="hero-section">
        <div className="page-width hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">A CREATOR STOREFRONT FOR YOUR WORK</span>
            <h1>Your audience. Your products. Your own storefront.</h1>
            <p>
              Create your own digital storefront, sell directly to your audience and
              simplify the way customers access your downloadable products.
            </p>
            <div className="hero-actions">
              <TrackLink href="/signup" event="signup_click" className="button">
                Start Selling <ArrowRight size={17} />
              </TrackLink>
              <Link href="/pricing" className="button button-secondary">
                Explore Pricing
              </Link>
            </div>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <Image
            src="/images/home/hero-storefront.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="hero-image"
          />
        </div>
      </section>

      <section className="section-space benefits-section">
        <div className="page-width">
          <div className="section-heading">
            <span className="eyebrow">Made for independent creators</span>
            <h2>Everything starts with your work</h2>
            <p>
              A straightforward place to present your digital products and share
              them with the people who value what you make.
            </p>
          </div>
          <div className="benefit-grid">
            {benefits.map(({ icon: Icon, title, body }) => (
              <article className="benefit-item" key={title}>
                <span className="benefit-icon"><Icon size={21} strokeWidth={1.8} /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-space storefront-cta-section">
        <div className="page-width storefront-cta-card">
          <div className="storefront-cta-copy">
            <span className="eyebrow">Your work, in one place</span>
            <h2>Your store is five minutes away</h2>
            <p>Choose the address your audience will use to find your digital products.</p>
          </div>
          <div className="storefront-cta-action">
            <form action="/signup" method="get" className="storefront-username-form">
              <label htmlFor="storefront-username">Choose your storefront address</label>
              <div className="storefront-username-row">
                <div className="storefront-url-input">
                  <span aria-hidden="true">cloverloop.in/</span>
                  <input
                    id="storefront-username"
                    name="username"
                    type="text"
                    placeholder="yourname"
                    autoComplete="username"
                    required
                    minLength={1}
                    maxLength={30}
                    pattern="[A-Za-z0-9]([A-Za-z0-9_\x2d]{0,28}[A-Za-z0-9])?"
                    title="Use 1–30 letters, numbers, underscores or hyphens. Start and end with a letter or number."
                  />
                </div>
                <button type="submit" className="button">
                  Start my store <ArrowRight size={17} />
                </button>
              </div>
              <p className="storefront-username-hint">Use letters, numbers, underscores or hyphens.</p>
            </form>
            <Link href="/faq" className="subtle-link">
              Read the FAQ <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="section-space product-section">
        <div className="page-width split-grid reverse-on-mobile">
          <div className="split-copy">
            <span className="eyebrow">Many ways to create</span>
            <h2>Digital products made from what you know</h2>
            <p>
              From practical guides to creative resources, bring your digital
              products together in one shareable destination.
            </p>
            <div className="product-tags">
              {["Ebooks", "Templates", "Presets", "Printables", "Guides", "Music resources"].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <Link href="/sell-digital-downloads" className="subtle-link">
              Explore digital downloads <ArrowRight size={16} />
            </Link>
          </div>
          <div className="split-image">
            <Image
              src="/images/home/digital-product-collection.webp"
              alt="Collection of ebooks, creative assets and digital downloads"
              width={1376}
              height={768}
              sizes="(max-width: 760px) 100vw, 50vw"
            />
          </div>
        </div>
      </section>

      <section className="section-space how-section">
        <div className="page-width">
          <div className="section-heading">
            <span className="eyebrow">Creator-owned payments</span>
            <h2>Your money never passes through us</h2>
            <p>
              Payments go directly from your buyer to your own Razorpay account. We handle
              payment verification and secure digital delivery.
            </p>
          </div>
          <div className="payment-steps">
            {[
              ["Buyer pays", "Customers pay using UPI, cards and other supported payment methods."],
              ["Your account", "Payment is received directly in your own Razorpay account."],
              ["Your bank", "Razorpay settles the money directly into your bank account."],
            ].map(([title, description], index) => (
              <div className="payment-step-group" key={title}>
                <article className={`payment-step-card payment-step-card-${index + 1}`}>
                  <span className="payment-step-number">0{index + 1}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
                {index < 2 && <ArrowRight className="payment-step-arrow" size={22} aria-hidden="true" />}
              </div>
            ))}
          </div>
          <ul className="payment-trust-list">
            {[
              "Payments are processed through your own payment gateway.",
              "Files are delivered only after successful payment verification.",
              "Secure, private download links.",
              "Transparent refund and anti-fraud policies.",
            ].map((point) => (
              <li key={point}><Check size={18} aria-hidden="true" />{point}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-space earnings-section">
        <div className="page-width">
          <div className="section-heading">
            <span className="eyebrow">Clear from the start</span>
            <h2>Understand exactly what you earn from every sale.</h2>
            <p>
              Your payment gateway charges its processing fee, CloverLoop charges its platform
              commission separately, and you keep the remaining revenue.
            </p>
          </div>
          <div className="earnings-grid" aria-label="Breakdown of a ₹100 sale by plan">
            {[
              { name: "Free", fee: "₹0.00", gst: "₹0.00", invoice: "₹0.00", net: "₹97.64" },
              { name: "Creator", fee: "₹4.00", gst: "₹0.72", invoice: "₹4.72", net: "₹92.92" },
              { name: "Pro Creator", fee: "₹3.00", gst: "₹0.54", invoice: "₹3.54", net: "₹94.10" },
            ].map((plan) => (
              <article className="earnings-card" key={plan.name}>
                <h3>{plan.name}</h3>
                <p className="earnings-card-caption">On a ₹100 product sale</p>
                <dl>
                  <div className="earnings-line">
                    <dt>Product selling price</dt><dd>₹100.00</dd>
                  </div>
                  <div className="earnings-line">
                    <dt>Razorpay processing fee (2.36%)</dt><dd>₹2.36</dd>
                  </div>
                  <div className="earnings-line">
                    <dt>CloverLoop commission (excl. GST)</dt><dd>{plan.fee}</dd>
                  </div>
                  <div className="earnings-line">
                    <dt>GST on commission (18%)</dt><dd>{plan.gst}</dd>
                  </div>
                  <div className="earnings-line">
                    <dt>Monthly commission invoice allocation (incl. GST)</dt><dd>{plan.invoice}</dd>
                  </div>
                  <div className="earnings-line">
                    <dt>Amount settled by Razorpay</dt><dd>₹97.64</dd>
                  </div>
                  <div className="earnings-receives">
                    <dt>Net earnings after all fees (including GST)</dt><dd>{plan.net}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <ul className="earnings-notes">
            <li>Razorpay charges 2.36% for payment processing and settles ₹97.64 from this ₹100 sale on every plan.</li>
            <li>CloverLoop charges 0%, 4% or 3% depending on the selected plan; 18% GST applies to the commission.</li>
            <li>CloverLoop&apos;s platform commission, including applicable GST, is invoiced separately each month and is not deducted from customer payments.</li>
            <li>Razorpay processing fees are separate from CloverLoop&apos;s commission.</li>
            <li>Pro Creator&apos;s ₹5,000 monthly subscription (excluding GST) is separate from this per-sale example.</li>
          </ul>
        </div>
      </section>

      <section className="section-space feature-overview">
        <div className="page-width">
          <div className="section-heading">
            <span className="eyebrow">Explore CloverLoop</span>
            <h2>Practical tools for your storefront journey</h2>
          </div>
          <div className="feature-cards">
            {featurePages.map((feature) => (
              <Link href={`/${feature.slug}`} key={feature.slug} className="feature-card">
                <span>{feature.heading}</span>
                <ArrowRight size={19} />
                <p>{feature.intro}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section-space creator-section">
        <div className="page-width split-grid reverse-on-mobile">
          <div className="split-copy">
            <span className="eyebrow">Independent by design</span>
            <h2>Built for creators and the people they reach</h2>
            <p>
              CloverLoop is designed around the direct relationship between
              independent creators and their audiences—without a central
              marketplace catalogue.
            </p>
            <Link href="/about" className="subtle-link">Learn about CloverLoop <ArrowRight size={16} /></Link>
          </div>
          <div className="split-image">
            <Image
              src="/images/home/creator-community.webp"
              alt="Independent creators sharing their work with their community"
              width={1376}
              height={768}
              sizes="(max-width: 760px) 100vw, 50vw"
            />
          </div>
        </div>
      </section>

      <section className="section-space faq-preview">
        <div className="reading-width">
          <div className="section-heading">
            <span className="eyebrow">Good to know</span>
            <h2>Frequently asked questions</h2>
          </div>
          {faqItems.slice(0, 4).map((item) => (
            <details className="faq-item" key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
          <Link href="/faq" className="subtle-link">See all questions <ArrowRight size={16} /></Link>
        </div>
      </section>

      <section className="section-space resource-preview">
        <div className="page-width">
          <div className="resource-preview-heading">
            <div>
              <span className="eyebrow">Learn and make</span>
              <h2>Ideas for your next digital product</h2>
            </div>
            <Link href="/resources" className="subtle-link">Visit Resource Hub <ArrowRight size={16} /></Link>
          </div>
          <div className="resource-card-grid compact">
            {resourceCards.slice(1, 4).map((resource) => (
              <Link href={`/resources/${resource.slug}`} className="resource-card" key={resource.slug}>
                <div className="resource-card-image">
                  <Image src={resource.image} alt={resource.title} width={1376} height={768} sizes="(max-width: 700px) 100vw, 30vw" />
                </div>
                <span className="eyebrow">{resource.category}</span>
                <h3>{resource.title}</h3>
                <p>{resource.description}</p>
                <span className="resource-card-link">Read the guide <ArrowRight size={15} /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <PublicCta title="Build a dedicated home for your digital products." />
    </PublicLayout>
  );
}
