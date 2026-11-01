import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { HelpBreadcrumbs } from "@/components/help/help-article-parts";
import { HelpBlocks } from "@/components/help/help-content";
import { HelpDocsShell } from "@/components/help/help-docs-shell";
import { CATEGORY_ALIASES, getCategories, getCategory, getCategoryArticles, getReferencesMarkdown } from "@/lib/help";
import { canonical } from "@/lib/site";

type Params = { params: Promise<{ category: string }> };

export function generateStaticParams() {
  return getCategories().map(({ slug }) => ({ category: slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category: slug } = await params;
  const category = getCategory(slug);
  if (!category) return {};
  const hasArticles = getCategoryArticles(slug).length > 0;
  const title = `${category.title} | CloverLoop Help Centre`;
  const description = `CloverLoop Help Centre articles in the ${category.title} category.`;
  return {
    title,
    description,
    alternates: { canonical: canonical(category.href) },
    robots: hasArticles ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { type: "website", title, description, url: canonical(category.href) },
    twitter: { card: "summary", title, description },
  };
}

export default async function HelpCategoryPage({ params }: Params) {
  const { category: slug } = await params;
  const alias = CATEGORY_ALIASES[slug];
  if (alias) permanentRedirect(`/help-center/${alias}`);
  const category = getCategory(slug);
  if (!category) notFound();

  const articles = getCategoryArticles(slug);
  const references = slug === "razorpay-setup" ? getReferencesMarkdown() : [];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Help Centre", item: canonical("/help-center") },
      { "@type": "ListItem", position: 2, name: category.title, item: canonical(category.href) },
    ],
  };

  return (
    <HelpDocsShell currentCategory={slug}>
      <HelpBreadcrumbs items={[{ label: "Help Centre", href: "/help-center" }, { label: category.title }]} />
      <h1 className="help-page-title">{category.title}</h1>
      {articles.length === 0 ? (
        <p>No articles are available in this category yet.</p>
      ) : (
        <ul className="help-article-list">
          {articles.map((article) => (
            <li key={article.slug}>
              <Link href={article.href}>
                <strong>{article.title}</strong>
                <span>{article.readingTimeMinutes} min read</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {references.length > 0 && (
        <section className="help-article-body help-references">
          <h2>Official external references</h2>
          <HelpBlocks blocks={references} />
        </section>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </HelpDocsShell>
  );
}
