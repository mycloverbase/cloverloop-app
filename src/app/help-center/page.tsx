import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Mail } from "lucide-react";
import { CategoryIcon } from "@/components/help/help-content";
import { HelpSearch } from "@/components/help/help-search";
import { getCategories, getCategoryArticles, getEssentialGuides, SUPPORT_EMAIL } from "@/lib/help";
import { canonical } from "@/lib/site";

const TITLE = "Help Centre | CloverLoop";
const DESCRIPTION =
  "Find step-by-step guides, practical instructions and answers to common questions about building your storefront and selling digital products with CloverLoop.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: canonical("/help-center") },
  robots: { index: true, follow: true },
  openGraph: { type: "website", title: TITLE, description: DESCRIPTION, url: canonical("/help-center") },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default function HelpCenterHome() {
  const categories = getCategories().map((c) => ({ ...c, count: getCategoryArticles(c.slug).length }));
  const essentials = getEssentialGuides();

  return (
    <>
      <section className="help-hero">
        <div className="page-width">
          <h1>How can we help you get started?</h1>
          <p>{DESCRIPTION}</p>
          <HelpSearch variant="hero" />
        </div>
      </section>

      <section className="page-width help-section" aria-labelledby="help-categories">
        <h2 id="help-categories">Browse by category</h2>
        <ul className="help-category-grid">
          {categories.map((category) => (
            <li key={category.slug}>
              <Link href={category.href} className="help-category-card">
                <span className="help-category-icon"><CategoryIcon name={category.icon} /></span>
                <h3>{category.title}</h3>
                <p>{category.count} {category.count === 1 ? "article" : "articles"}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {essentials.length > 0 && (
        <section className="page-width help-section" aria-labelledby="help-essentials">
          <h2 id="help-essentials">Essential guides</h2>
          <ul className="help-essentials">
            {essentials.map((article) => (
              <li key={article.href}>
                <Link href={article.href}>
                  <span>{article.title}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="page-width help-section" aria-labelledby="help-support">
        <div className="help-support-band">
          <Mail size={22} aria-hidden="true" />
          <div>
            <h2 id="help-support">Contact support</h2>
            {SUPPORT_EMAIL ? (
              <p>Email us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
            ) : (
              <p>The CloverLoop support email will be shown here once it is configured.</p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
