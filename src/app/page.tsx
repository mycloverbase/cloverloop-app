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
    body: "The planned payment model connects your own Razorpay account, with customer payments settled to you by Razorpay.",
  },
  {
    icon: Check,
    title: "A clearer delivery experience",
    body: "The planned platform includes secure digital delivery with configurable download limits.",
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
                Get Started for Free <ArrowRight size={17} />
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

      <section className="section-space storefront-section">
        <div className="page-width split-grid">
          <div className="split-image">
            <Image
              src="/images/home/storefront-mockup.webp"
              alt="Illustrative creator storefront concept for digital products"
              width={1376}
              height={768}
              sizes="(max-width: 760px) 100vw, 50vw"
            />
          </div>
          <div className="split-copy">
            <span className="eyebrow">Your work, in one place</span>
            <h2>A storefront that feels like yours</h2>
            <p>
              Give your audience one dedicated place to explore your work. The
              planned storefront address follows a simple format:
            </p>
            <div className="url-example"><span>cloverloop.in/</span>creatorname</div>
            <p>
              Share one destination across social profiles, video descriptions,
              websites and other channels.
            </p>
            <Link href="/store-builder" className="subtle-link">
              Explore the Store Builder <ArrowRight size={16} />
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
            <span className="eyebrow">A direct path</span>
            <h2>How it works</h2>
            <p>The intended product workflow is designed to feel clear from the first step.</p>
          </div>
          <div className="steps-grid">
            {[
              ["01", "Create your creator storefront."],
              ["02", "Connect your payment gateway and add your digital products."],
              ["03", "Share your storefront with your audience."],
            ].map(([number, text]) => (
              <article className="step-card" key={number}>
                <span>{number}</span>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <p className="scope-note">
            This describes the intended product workflow. Payment connection,
            product management and digital delivery are not implemented in the
            current marketing website sprint.
          </p>
        </div>
      </section>

      <section className="section-space payment-section">
        <div className="page-width split-grid">
          <div className="split-copy">
            <span className="eyebrow">Creator-owned payment architecture</span>
            <h2>Your payment account. Your settlement.</h2>
            <p>
              The planned model uses each creator&apos;s own Razorpay account.
              Razorpay processes customer payments and settles proceeds directly
              to the creator. CloverLoop&apos;s platform commission is calculated
              separately and invoiced monthly.
            </p>
            <Link href="/payment-gateways" className="subtle-link">
              Understand the planned payment flow <ArrowRight size={16} />
            </Link>
          </div>
          <div className="payment-flow" aria-label="Planned payment flow">
            <div><span>Customer</span><small>Makes a purchase</small></div>
            <ArrowRight aria-hidden="true" />
            <div><span>Creator&apos;s Razorpay</span><small>Processes payment</small></div>
            <ArrowRight aria-hidden="true" />
            <div><span>Creator&apos;s bank</span><small>Direct settlement</small></div>
            <p>CloverLoop invoices its platform commission separately each month.</p>
          </div>
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

      <section className="section-space pricing-preview">
        <div className="page-width split-grid">
          <div className="split-copy">
            <span className="eyebrow">Transparent pricing</span>
            <h2>Choose a plan that fits the way you create</h2>
            <p>
              Compare the intended Free, Creator and Pro Creator plan fees. Platform
              commission applies to successful paid transactions and is invoiced
              monthly. Razorpay processing charges are additional.
            </p>
            <Link href="/pricing" className="subtle-link">
              View all plan details <ArrowRight size={16} />
            </Link>
          </div>
          <div className="price-preview-list">
            <div><span>Free</span><strong>₹0/month</strong><small>0% platform transaction fee</small></div>
            <div><span>Creator</span><strong>₹0/month</strong><small>3% platform transaction fee</small></div>
            <div><span>Pro Creator</span><strong>₹10,000/month</strong><small>2% platform transaction fee</small></div>
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
