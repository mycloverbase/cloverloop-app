import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ArticleBody,
  HelpBreadcrumbs,
  PrevNext,
  ReadingTime,
  RelatedArticles,
  SupportCallout,
  TableOfContents,
} from "@/components/help/help-article-parts";
import { HelpDocsShell } from "@/components/help/help-docs-shell";
import {
  getAdjacentArticles,
  getArticle,
  getCategory,
  getPublishedArticles,
  getRelatedArticles,
  SUPPORT_EMAIL,
} from "@/lib/help";
import { canonical, SITE_NAME } from "@/lib/site";

type Params = { params: Promise<{ category: string; article: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return getPublishedArticles().map((a) => ({ category: a.category, article: a.slug }));
}

function metaDescription(text: string) {
  if (text.length <= 160) return text;
  return `${text.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, article: slug } = await params;
  const article = getArticle(category, slug);
  if (!article) return {};
  const title = `${article.title} | CloverLoop Help Centre`;
  const description = metaDescription(article.description);
  return {
    title,
    description,
    alternates: { canonical: article.url },
    robots: { index: true, follow: true },
    openGraph: { type: "article", title, description, url: article.url, modifiedTime: article.lastUpdated },
    twitter: { card: "summary", title, description },
  };
}

export default async function HelpArticlePage({ params }: Params) {
  const { category: categorySlug, article: slug } = await params;
  const article = getArticle(categorySlug, slug);
  const category = getCategory(categorySlug);
  if (!article || !category) notFound();

  const related = getRelatedArticles(article);
  const { previous, next } = getAdjacentArticles(article);
  const toc = <TableOfContents blocks={article.blocks} />;

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Help Centre", item: canonical("/help-center") },
        { "@type": "ListItem", position: 2, name: category.title, item: canonical(category.href) },
        { "@type": "ListItem", position: 3, name: article.title, item: article.url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: article.title,
      description: metaDescription(article.description),
      dateModified: article.lastUpdated,
      mainEntityOfPage: article.url,
      articleSection: category.title,
      wordCount: article.wordCount,
      publisher: { "@type": "Organization", name: SITE_NAME, url: canonical("/") },
    },
  ];

  return (
    <HelpDocsShell currentCategory={categorySlug} currentArticle={slug} aside={toc}>
      <article className="help-article">
        <HelpBreadcrumbs
          items={[
            { label: "Help Centre", href: "/help-center" },
            { label: category.title, href: category.href },
            { label: article.title },
          ]}
        />
        <header>
          <p className="eyebrow">{category.title}</p>
          <h1 className="help-page-title">{article.title}</h1>
          <p className="help-meta">
            <ReadingTime minutes={article.readingTimeMinutes} />
            <span className="help-meta-item">
              Last updated{" "}
              <time dateTime={article.lastUpdated}>
                {new Date(article.lastUpdated).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
              </time>
            </span>
          </p>
        </header>
        <div className="help-toc-inline">{toc}</div>
        <div className="help-article-body">
          <ArticleBody article={article} />
        </div>
        <SupportCallout email={SUPPORT_EMAIL} />
        <RelatedArticles articles={related} />
        <PrevNext previous={previous} next={next} />
      </article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </HelpDocsShell>
  );
}
