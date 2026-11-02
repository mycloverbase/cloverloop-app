import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Breadcrumbs } from "@/components/site-header";
import { HelpBlocks } from "@/components/help/help-content";
import { comparisonArticles, type ComparisonArticle } from "@/lib/comparisons";
import { canonical, PRODUCTION_URL } from "@/lib/site";

function structuredDataScript(data: object, id: string) {
  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export function ComparisonArticlePage({ article }: { article: ComparisonArticle }) {
  const articleUrl = canonical(`/compare/${article.slug}`);
  const blogPosting = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.description,
    articleBody: article.bodyText,
    articleSection: "Platform comparison",
    inLanguage: "en-IN",
    dateModified: article.reviewedOnISO,
    mainEntityOfPage: articleUrl,
    image: `${PRODUCTION_URL}/images/home/hero.webp`,
    publisher: {
      "@type": "Organization",
      name: "CloverLoop",
      url: PRODUCTION_URL,
      logo: { "@type": "ImageObject", url: `${PRODUCTION_URL}/images/brand/logo.png` },
    },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: PRODUCTION_URL },
      { "@type": "ListItem", position: 2, name: "Compare Platforms", item: canonical("/compare") },
      { "@type": "ListItem", position: 3, name: article.title, item: articleUrl },
    ],
  };
  const faqSchema = article.faqs.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: article.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      }
    : undefined;
  const related = comparisonArticles.filter((item) => item.slug !== article.slug);

  return (
    <>
      <Breadcrumbs items={[
        { label: "Home", href: "/" },
        { label: "Compare Platforms", href: "/compare" },
        { label: article.title },
      ]} />
      <article className="comparison-article page-width">
        <header className="comparison-article-header">
          <span className="eyebrow">Platform comparison</span>
          <h1>{article.title}</h1>
          <p className="comparison-article-summary">{article.summary}</p>
          <p className="comparison-article-review">
            Last reviewed {article.reviewedOn} <span aria-hidden="true">·</span> Pricing reviewed by the CloverLoop product team quarterly
          </p>
          <p className="comparison-pricing-disclaimer">
            Prices, fees, tax treatment and availability can change. Confirm current terms with the
            linked provider before choosing a plan.
          </p>
        </header>
        <div className="comparison-article-body help-article-body">
          <HelpBlocks blocks={article.blocks} />
        </div>
        <nav className="comparison-related" aria-label="Related platform comparisons">
          <h2>Compare other platforms</h2>
          <ul>
            {related.map((item) => (
              <li key={item.slug}>
                <Link href={`/compare/${item.slug}`}>{item.title}<ArrowRight size={16} aria-hidden="true" /></Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="comparison-cta">
          <div>
            <h2>Explore CloverLoop plans</h2>
            <p>Review plan limits, fees and the ₹100 sale calculation before choosing a plan.</p>
          </div>
          <Link className="button" href="/pricing">View pricing <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </article>
      {structuredDataScript(blogPosting, "comparison-blogposting")}
      {structuredDataScript(breadcrumb, "comparison-breadcrumb")}
      {faqSchema && structuredDataScript(faqSchema, "comparison-faq")}
    </>
  );
}
