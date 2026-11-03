import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicLayout } from "@/components/public-layout";
import { PublicCta } from "@/components/public-cta";
import { Breadcrumbs } from "@/components/site-header";
import { TrackLink } from "@/components/track-link";
import { companyPages, faqItems, featurePages, pageTitles, publicLinks, PRODUCTION_URL } from "@/lib/site";
import { PricingPage } from "@/components/pricing-page";
import { LegalPolicyPage } from "@/components/legal-policy-page";
import { legalPolicyPages } from "@/lib/legal-policies";

const slugs = [
  ...featurePages.map((item) => item.slug),
  ...Object.keys(companyPages),
  ...legalPolicyPages.map((item) => item.slug),
  "pricing",
  "faq",
  "sitemap",
];

export const dynamicParams = false;

export function generateStaticParams() {
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const legalPolicy = legalPolicyPages.find((item) => item.slug === slug);
  if (legalPolicy) {
    const url = `${PRODUCTION_URL}/${slug}`;
    return {
      title: legalPolicy.seoTitle,
      description: legalPolicy.description,
      alternates: { canonical: url },
      robots: { index: true, follow: true },
      openGraph: {
        type: "article",
        title: legalPolicy.seoTitle,
        description: legalPolicy.description,
        url,
        siteName: "CloverLoop",
      },
      twitter: {
        card: "summary",
        title: legalPolicy.seoTitle,
        description: legalPolicy.description,
      },
    };
  }
  const feature = featurePages.find((item) => item.slug === slug);
  const company = companyPages[slug];
  const meta = feature
    ? { title: feature.title, description: feature.description }
    : company
      ? { title: company.title, description: company.description }
      : pageTitles[slug];
  if (!meta) return {};
  return {
    title: meta.title,
    description: meta.description,
    ...(company?.keywords ? { keywords: company.keywords } : {}),
    alternates: { canonical: `${PRODUCTION_URL}/${slug}` },
    ...(slug === "founding-creators" || slug === "contact"
      ? { robots: { index: false, follow: false } }
      : {}),
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: `${PRODUCTION_URL}/${slug}`,
      type: "website",
      images: [feature?.image ?? "/images/home/hero.webp"],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: [feature?.image ?? "/images/home/hero.webp"],
    },
  };
}

function FeaturePage({ slug }: { slug: string }) {
  const page = featurePages.find((item) => item.slug === slug);
  if (!page) return null;
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Features" }, { label: page.heading }]} />
      <section className="feature-hero page-width">
        <div className="feature-hero-copy">
          <span className="eyebrow">CloverLoop features</span>
          <h1>{page.heading}</h1>
          <p>{page.intro}</p>
          <TrackLink href="/signup" event="signup_click" className="button">
            Get Started for Free <ArrowRight size={17} />
          </TrackLink>
        </div>
        <div className="feature-hero-image">
          <Image src={page.image} alt={page.imageAlt} width={1376} height={768} priority sizes="(max-width: 760px) 100vw, 54vw" />
        </div>
      </section>
      <section className="section-space detail-section">
        <div className="reading-width">
          {page.sections.map((section) => (
            <article key={section.heading}>
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
            </article>
          ))}
          {slug === "sell-digital-downloads" && (
            <ul className="check-list">
              <li><Check size={18} /> Clear product details and access instructions help buyers understand what a digital download includes.</li>
            </ul>
          )}
        </div>
      </section>
      <PublicCta />
    </>
  );
}

function AboutBlocks({ blocks }: { blocks: NonNullable<(typeof companyPages)[string]["blocks"]> }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "h2":
            return index === 0 ? <h1 key={index}>{block.text}</h1> : <h2 key={index}>{block.text}</h2>;
          case "h3":
            return <h3 key={index}>{block.text}</h3>;
          case "strong":
            return <p key={index}><strong>{block.text}</strong></p>;
          case "ul":
            return (
              <ul key={index}>
                {block.items.map((item) => (
                  <li key={item.label ?? item.text}>
                    {item.label && <strong>{item.label}</strong>} {item.text}
                  </li>
                ))}
              </ul>
            );
          case "cta":
            return (
              <TrackLink key={index} href={block.href} event="signup_click" className="button">
                {block.text} <ArrowRight size={16} />
              </TrackLink>
            );
          default:
            return <p key={index}>{block.text}</p>;
        }
      })}
    </>
  );
}

function CompanyPage({ slug }: { slug: string }) {
  const page = companyPages[slug];
  if (!page) return null;
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  if (page.blocks) {
    return (
      <>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "About" }]} />
        <section className="simple-page page-width">
          <span className="eyebrow">CloverLoop</span>
          <div className="simple-page-body">
            <AboutBlocks blocks={page.blocks} />
          </div>
        </section>
        <PublicCta />
      </>
    );
  }
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: page.heading }]} />
      <section className="simple-page page-width">
        <span className="eyebrow">CloverLoop</span>
        <h1>{page.heading}</h1>
        <div className="simple-page-body">
          {page.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {slug === "contact" && supportEmail && (
            <p><a className="subtle-link" href={`mailto:${supportEmail}`}>{supportEmail}</a></p>
          )}
          {slug === "help-center" && <Link href="/faq" className="button">Visit the FAQ <ArrowRight size={16} /></Link>}
          {slug === "founding-creators" && (
            <TrackLink href="/signup" event="signup_click" className="button">Get Started for Free <ArrowRight size={16} /></TrackLink>
          )}
          {slug === "partner-program" && <Link href="/contact" className="subtle-link">Contact CloverLoop <ArrowRight size={16} /></Link>}
          {slug === "terms" || slug === "privacy" ? <p className="draft-label">Draft — requires qualified legal review before publication.</p> : null}
        </div>
      </section>
      <PublicCta />
    </>
  );
}

function FaqPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "FAQ" }]} />
      <section className="section-space faq-page page-width">
        <header className="section-heading">
          <span className="eyebrow">Answers and details</span>
          <h1>Frequently asked questions</h1>
          <p>Learn about CloverLoop, creator storefronts, pricing and payments.</p>
        </header>
        <div className="faq-list">
          {faqItems.map((item) => (
            <details className="faq-item" key={item.question}>
              <summary>{item.question}</summary><p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
      <PublicCta />
    </>
  );
}

function SitemapPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Sitemap" }]} />
      <section className="simple-page page-width">
        <span className="eyebrow">Browse CloverLoop</span>
        <h1>Website sitemap</h1>
        <div className="sitemap-columns">
          {[{ title: "Features", links: publicLinks.features }, { title: "Company", links: publicLinks.company }, { title: "Resources", links: publicLinks.resources }, { title: "Compare Platforms", links: publicLinks.comparisons }, { title: "Legal", links: publicLinks.legal }].map((group) => (
            <section key={group.title}>
              <h2>{group.title}</h2>
              <ul>{group.links.map((link) => <li key={link.href}><Link href={link.href}>{link.label}</Link></li>)}</ul>
            </section>
          ))}
          <section><h2>Home</h2><ul><li><Link href="/">Homepage</Link></li></ul></section>
        </div>
      </section>
    </>
  );
}

export default async function ContentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slugs.includes(slug)) notFound();
  let content = null;
  if (legalPolicyPages.some((item) => item.slug === slug)) content = <LegalPolicyPage slug={slug} />;
  else if (featurePages.some((item) => item.slug === slug)) content = <FeaturePage slug={slug} />;
  else if (slug === "pricing") content = <PricingPage />;
  else if (slug === "faq") content = <FaqPage />;
  else if (slug === "sitemap") content = <SitemapPage />;
  else content = <CompanyPage slug={slug} />;
  return <PublicLayout>{content}</PublicLayout>;
}
