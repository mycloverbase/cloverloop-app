import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Breadcrumbs } from "@/components/site-header";
import { PublicLayout } from "@/components/public-layout";
import { comparisonArticles } from "@/lib/comparisons";
import { canonical, PRODUCTION_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Compare Digital Product Platforms | CloverLoop",
  description:
    "Compare CloverLoop with SuperProfile, Gumroad, Payhip and Instamojo on pricing, fees, payment processing and creator features.",
  alternates: { canonical: canonical("/compare") },
  openGraph: {
    type: "website",
    title: "Compare Digital Product Platforms | CloverLoop",
    description:
      "Compare platform pricing, transaction fees, payment processing and product features for digital-product creators.",
    url: canonical("/compare"),
    images: ["/images/home/hero.webp"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Compare Digital Product Platforms | CloverLoop",
    description:
      "Compare platform pricing, transaction fees, payment processing and creator features.",
    images: ["/images/home/hero.webp"],
  },
};

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: PRODUCTION_URL },
    { "@type": "ListItem", position: 2, name: "Compare Platforms", item: canonical("/compare") },
  ],
};

export default function CompareHubPage() {
  return (
    <PublicLayout>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Compare Platforms" }]} />
      <section className="comparison-hub page-width">
        <header className="comparison-hub-header">
          <span className="eyebrow">Compare platforms</span>
          <h1>Choose the right platform for your digital products</h1>
          <p>
            Compare plans, platform commissions, payment processing and product features. CloverLoop
            pricing includes the base rate and its effective commission after 18% GST; competitor
            prices are linked to official sources and identify their stated fee basis.
          </p>
        </header>
        <div className="comparison-hub-grid">
          {comparisonArticles.map((article) => (
            <article className="comparison-hub-card" key={article.slug}>
              <span className="eyebrow">Last reviewed {article.reviewedOn}</span>
              <h2><Link href={`/compare/${article.slug}`}>{article.title}</Link></h2>
              <p>{article.summary}</p>
              <Link className="comparison-card-link" href={`/compare/${article.slug}`}>
                Read comparison <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
        <p className="comparison-hub-pricing">
          Start with <Link href="/pricing">CloverLoop plans and the ₹100 transaction example</Link>,
          then check each provider&apos;s linked pricing terms for your region and account.
        </p>
      </section>
      <script
        id="compare-hub-breadcrumb"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb).replace(/</g, "\\u003c") }}
      />
    </PublicLayout>
  );
}
