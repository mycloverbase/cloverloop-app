import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, CreditCard, Download, Store } from "lucide-react";
import { PublicLayout } from "@/components/public-layout";
import { PublicCta } from "@/components/public-cta";
import { TrackLink } from "@/components/track-link";
import { faqItems, featurePages, resourceCards } from "@/lib/site";
import "./home.css";

const benefits = [
  {
    icon: Store,
    title: "A creator-focused storefront",
    body: "Plan one clear destination for your audience to explore your digital products.",
  },
  {
    icon: Download,
    title: "Digital products",
    body: "Prepare ebooks, templates, presets, printables and other downloadable resources for a creator-led offer.",
  },
  {
    icon: CreditCard,
    title: "Transparent plan fees",
    body: "Understand platform commission alongside separate payment-provider processing charges.",
  },
  {
    icon: Check,
    title: "Plans for every stage",
    body: "Choose from a zero-cost Free plan, the recommended Creator plan, or Pro Creator for higher-volume sales.",
  },
];

const featureArt: Record<string, string> = {
  "sell-online": "/images/home/illustrations/feature-sell-online.svg",
  "sell-digital-downloads": "/images/home/illustrations/feature-downloads.svg",
  "store-builder": "/images/home/illustrations/feature-store-builder.svg",
  "payment-gateways": "/images/home/illustrations/feature-payments.svg",
};

const heroAssurances =["₹0/month to start", "Your own shareable storefront", "Transparent platform fees"];

const plans = [
  {
    name: "Free",
    price: "₹0",
    fee: "0% platform fee",
    points: [
      "0% CloverLoop platform fee up to ₹10,000 cumulative Gross Sales per creator account lifetime.",
      "1 paid and 5 free product listings per account lifetime.",
    ],
    cta: { label: "Start for free", href: "/signup", track: true },
  },
  {
    name: "Creator",
    price: "₹0",
    fee: "4% platform fee",
    featured: true,
    points: ["Unlimited paid and free product listings.", "No cumulative Gross Sales limit."],
    cta: { label: "Start with Creator", href: "/signup", track: true },
  },
  {
    name: "Pro Creator",
    price: "₹2,999",
    fee: "0% platform fee",
    points: [
      "For established, higher-volume creators.",
      "Unlimited listings and no cumulative Gross Sales limit.",
    ],
    cta: { label: "See Pro details", href: "/pricing", track: false },
  },
];

const launchBadges = [
  {
    name: "Launchbase",
    href: "https://www.launchbase.in/products/cloverloop",
    image: "https://www.launchbase.in/badges/featured.svg",
    alt: "Featured on Launchbase",
    width: 180,
    height: 39,
  },
  {
    name: "Fazier",
    href: "https://fazier.com/launches/cloverloop.in",
    image: "https://fazier.com/api/v1//public/badges/launch_badges.svg?badge_type=featured&theme=neutral",
    alt: "Featured on Fazier",
    width: 250,
    height: 54,
  },
  {
    name: "StartupBase",
    href: "https://startupbase.io/products/cloverloop?utm_source=startupbase&utm_medium=badge&utm_campaign=featured-badge-neutral",
    image: "https://statics.startupbase.io/site/badges/featured-on-sb-neutral.svg",
    alt: "Featured on StartupBase",
    width: 200,
    height: 55,
  },
];

export default function HomePage() {
  return (
    <PublicLayout>
      <div className="home">
        <section className="home-hero">
          <div className="page-width home-hero-grid">
            <div className="home-hero-copy">
              <span className="eyebrow">Your business. Your storefront. Your audience.</span>
              <h1>
                <span>Create your storefront.</span>
                <span className="home-hero-accent">Sell digital products.</span>
                <span>Grow your audience.</span>
              </h1>
              <p className="home-hero-lead">
                CloverLoop gives you everything you need to showcase your products, manage your
                storefront and grow your digital business. All in one place.
              </p>
              <div className="home-hero-actions">
                <TrackLink href="/signup" event="signup_click" className="button button-lg">
                  Build your store <ArrowRight size={18} />
                </TrackLink>
                <Link href="/pricing" className="button button-secondary button-lg">
                  Explore Pricing
                </Link>
              </div>
              <ul className="home-hero-assurances">
                {heroAssurances.map((item) => (
                  <li key={item}>
                    <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="home-hero-visual" aria-hidden="true">
              <Image
                src="/images/home/hero-creator-storefront.webp"
                alt=""
                width={2050}
                height={1600}
                priority
                sizes="(max-width: 1023px) min(100vw, 720px), 660px"
              />
            </div>
          </div>
        </section>

        <section className="home-proof" aria-label="CloverLoop launch badges">
          <div className="page-width home-proof-row">
            <span className="home-proof-label">Featured on</span>
            <div className="home-proof-badges">
              {launchBadges.map((badge) => (
                <a
                  className="home-proof-badge"
                  href={badge.href}
                  key={badge.name}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={badge.image}
                    alt={badge.alt}
                    width={badge.width}
                    height={badge.height}
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="section-space home-benefits">
          <div className="page-width">
            <div className="section-heading">
              <span className="eyebrow">Made for independent creators</span>
              <h2>Everything starts with your work</h2>
              <p>
                A straightforward place to present your digital products and share
                them with the people who value what you make.
              </p>
            </div>
            <div className="home-benefit-grid">
              {benefits.map(({ icon: Icon, title, body }) => (
                <article className="home-benefit" key={title}>
                  <span className="home-icon"><Icon size={21} strokeWidth={1.8} /></span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section-space home-username">
          <div className="page-width storefront-cta-card">
            <div className="storefront-cta-copy">
              <span className="eyebrow">Your creator identity</span>
              <h2>Choose a name for your creator account</h2>
              <p>Start with a recognisable name for your work and audience.</p>
              <Image
                className="home-username-art"
                src="/images/home/illustrations/storefront-url.svg"
                alt=""
                width={480}
                height={176}
                unoptimized
              />
            </div>
            <div className="storefront-cta-action">
              <form action="/signup" method="get" className="storefront-username-form">
                <label htmlFor="storefront-username">Choose a creator username</label>
                <div className="storefront-username-row">
                  <div className="storefront-url-input">
                    <span aria-hidden="true">@</span>
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
                    Create my account <ArrowRight size={17} />
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

        <section className="section-space home-products">
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

        <section className="section-space home-pricing">
          <div className="page-width">
            <div className="section-heading">
              <span className="eyebrow">Published plan pricing</span>
              <h2>Choose the plan that fits your catalogue and sales.</h2>
              <p>
                Creator is our recommended no-monthly-fee plan. Payment gateway charges are separate
                from CloverLoop&apos;s platform commission. See the <Link href="/pricing">full pricing details</Link>.
              </p>
            </div>
            <div className="home-plan-grid" aria-label="CloverLoop plan pricing">
              {plans.map((plan) => (
                <article className={plan.featured ? "home-plan home-plan-featured" : "home-plan"} key={plan.name}>
                  <div className="home-plan-head">
                    <h3>{plan.name}</h3>
                    {plan.featured ? <span className="home-plan-badge">Recommended</span> : null}
                  </div>
                  <p className="home-plan-price">
                    <strong>{plan.price}</strong>
                    <span>/month</span>
                  </p>
                  <p className="home-plan-fee">{plan.fee}</p>
                  <ul>
                    {plan.points.map((point) => (
                      <li key={point}>
                        <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                        {point}
                      </li>
                    ))}
                  </ul>
                  {plan.cta.track ? (
                    <TrackLink
                      href={plan.cta.href}
                      event="signup_click"
                      className={plan.featured ? "button" : "button button-secondary"}
                    >
                      {plan.cta.label} <ArrowRight size={17} />
                    </TrackLink>
                  ) : (
                    <Link href={plan.cta.href} className="button button-secondary">
                      {plan.cta.label} <ArrowRight size={17} />
                    </Link>
                  )}
                </article>
              ))}
            </div>
            <aside className="home-fee-note">
              <span className="home-icon"><CreditCard size={20} strokeWidth={1.8} /></span>
              <div>
                <h3>Payment provider fees are separate</h3>
                <p>
                  Razorpay or another payment provider may charge processing fees under its own terms.
                  Those charges are payable separately by the creator and are not included in
                  CloverLoop&apos;s platform commission.
                </p>
              </div>
            </aside>
          </div>
        </section>

        <section className="section-space home-features">
          <div className="page-width">
            <div className="section-heading">
              <span className="eyebrow">Explore CloverLoop</span>
              <h2>Practical tools for your storefront journey</h2>
            </div>
            <div className="home-feature-grid">
              {featurePages.map((feature) => (
                <Link href={`/${feature.slug}`} key={feature.slug} className="home-feature">
                  <span className="home-feature-art">
                    <Image
                      src={featureArt[feature.slug]}
                      alt=""
                      width={480}
                      height={270}
                      unoptimized
                    />
                  </span>
                  <h3>{feature.heading}</h3>
                  <p>{feature.intro}</p>
                  <span className="home-feature-link">Learn more <ArrowRight size={16} /></span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="section-space home-creators">
          <div className="page-width split-grid reverse-on-mobile home-split-flip">
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
      </div>
    </PublicLayout>
  );
}
