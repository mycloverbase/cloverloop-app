import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TrackLink } from "@/components/track-link";
import { Breadcrumbs } from "@/components/site-header";
import { PublicCta } from "@/components/public-cta";
import { ResourceViewEvent } from "@/components/resource-view-event";
import { getArticle, getArticleReadingTime, type ResourceBlock } from "@/lib/resources";
import { PRODUCTION_URL, resourceCards } from "@/lib/site";
import { notFound } from "next/navigation";
import Image from "next/image";

function ArticleBlocks({ blocks }: { blocks: ResourceBlock[] }) {
  return (
    <div className="prose-content article-copy">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return <h2 id={`section-${index}`} key={index}>{block.text}</h2>;
        }
        if (block.type === "takeaway") {
          return <p className="takeaway" key={index}><strong>Key takeaway:</strong> {block.text}</p>;
        }
        return <p key={index}>{block.text}</p>;
      })}
    </div>
  );
}

export function ArticlePage({ slug }: { slug: string }) {
  const article = getArticle(slug);
  if (!article) notFound();

  const { minutes, wordCount } = getArticleReadingTime(article);
  const related = article.related
    .map((relatedSlug) => resourceCards.find((resource) => resource.slug === relatedSlug))
    .filter((resource): resource is (typeof resourceCards)[number] => Boolean(resource));
  const headings = article.blocks
    .map((block, index) => ({ ...block, index }))
    .filter((block) => block.type === "heading");
  const organization = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    image: `${PRODUCTION_URL}${article.image}`,
    publisher: {
      "@type": "Organization",
      name: "CloverLoop",
      url: PRODUCTION_URL,
    },
    mainEntityOfPage: `${PRODUCTION_URL}/resources/${article.slug}`,
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: PRODUCTION_URL },
      { "@type": "ListItem", position: 2, name: "Resource Hub", item: `${PRODUCTION_URL}/resources` },
      { "@type": "ListItem", position: 3, name: article.title, item: `${PRODUCTION_URL}/resources/${article.slug}` },
    ],
  };

  return (
    <>
      <ResourceViewEvent slug={slug} />
      <Breadcrumbs items={[
        { label: "Home", href: "/" },
        { label: "Resources", href: "/resources" },
        { label: article.category },
        { label: article.title },
      ]} />
      <article className="article-page">
        <header className="article-header reading-width">
          <span className="eyebrow">{article.category}</span>
          <h1>{article.title}</h1>
          <p className="article-intro">{article.blocks.find((block) => block.type === "paragraph")?.text}</p>
          <div className="article-meta">
            <span>{minutes} min read</span><span aria-hidden="true">·</span><span>{wordCount.toLocaleString()} words</span>
          </div>
        </header>
        <div className="article-cover reading-width">
          <Image
            src={article.image}
            alt={article.imageAlt}
            width={1376}
            height={768}
            priority
            sizes="(max-width: 760px) 100vw, 740px"
          />
        </div>
        {headings.length > 3 && (
          <nav className="article-toc reading-width" aria-label="Table of contents">
            <h2>In this guide</h2>
            <ol>
              {headings.map((heading) => (
                <li key={heading.index}><a href={`#section-${heading.index}`}>{heading.text}</a></li>
              ))}
            </ol>
          </nav>
        )}
        <div className="reading-width">
          <ArticleBlocks blocks={article.blocks} />
          <div className="article-references">
            <h2>Explore related resources</h2>
            <ul>{related.map((item) => <li key={item.slug}><Link href={`/resources/${item.slug}`}>{item.title} <ArrowRight size={14} /></Link></li>)}</ul>
            {slug === "digital-products" && <Link href="/sell-digital-downloads" className="subtle-link">Explore CloverLoop digital downloads <ArrowRight size={15} /></Link>}
            <TrackLink href="/signup" event="resource_cta_click" eventValue={slug} className="button">
              Get Started for Free <ArrowRight size={16} />
            </TrackLink>
          </div>
        </div>
      </article>
      {related.length > 0 && (
        <section className="related-resources section-space">
          <div className="page-width">
            <h2>Keep exploring</h2>
            <div className="related-resource-list">
              {related.slice(0, 3).map((item) => (
                <Link href={`/resources/${item.slug}`} key={item.slug}>{item.title}<ArrowRight size={16} /></Link>
              ))}
            </div>
          </div>
        </section>
      )}
      <PublicCta title="Create a dedicated home for your digital products." />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
    </>
  );
}
