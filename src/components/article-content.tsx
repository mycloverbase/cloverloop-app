import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TrackLink } from "@/components/track-link";
import { Breadcrumbs } from "@/components/site-header";
import { PublicCta } from "@/components/public-cta";
import { ResourceViewEvent } from "@/components/resource-view-event";
import { getArticle, getArticleReadingTime, type ResourceBlock } from "@/lib/resources";
import { getGuide } from "@/lib/guides";
import { PRODUCTION_URL, resourceCards } from "@/lib/site";
import { notFound } from "next/navigation";
import Image from "next/image";

function InlineText({ text }: { text: string }) {
  const tokenPattern = /(\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]+)\)|\*\*([^*]+)\*\*)/g;
  const content: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > cursor) content.push(text.slice(cursor, match.index));
    if (match[2] && match[3]) {
      content.push(match[3].startsWith("/")
        ? <Link href={match[3]} key={match.index}>{match[2]}</Link>
        : <a href={match[3]} key={match.index}>{match[2]}</a>);
    } else if (match[4]) {
      content.push(<strong key={match.index}>{match[4]}</strong>);
    }
    cursor = tokenPattern.lastIndex;
  }

  if (cursor < text.length) content.push(text.slice(cursor));
  return content;
}

function ArticleBlocks({ blocks, slug }: { blocks: ResourceBlock[]; slug: string }) {
  return (
    <div className="prose-content article-copy">
      {blocks.map((block, index) => {
        if (block.type === "cta") {
          return (
            <div className="article-content-cta" key={index}>
              {block.text && <p><InlineText text={block.text} /></p>}
              <TrackLink href={block.href} event="resource_cta_click" eventValue={slug} className="button">
                {block.label} <ArrowRight size={16} />
              </TrackLink>
            </div>
          );
        }
        if (block.type === "heading") {
          return <h2 id={`section-${index}`} key={index}>{block.text}</h2>;
        }
        if (block.type === "subheading") {
          return <h3 id={`section-${index}`} key={index}>{block.text}</h3>;
        }
        if (block.type === "table") {
          return (
            <div className="article-table-wrap" key={index} role="region" aria-label={block.text} tabIndex={0}>
              <table>
                <caption className="visually-hidden">{block.text}</caption>
                <thead>
                  <tr>{block.headers.map((header, cellIndex) => <th scope="col" key={cellIndex}><InlineText text={header} /></th>)}</tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => <td key={cellIndex}><InlineText text={cell} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === "ordered-list" || block.type === "unordered-list") {
          const items = block.items ?? block.text.split(/\r?\n/).filter(Boolean).map((item) => item.replace(/^\d+\.\s*/, ""));
          if (block.type === "ordered-list") {
            const start = block.start ?? Number(block.text.match(/^\s*(\d+)\./)?.[1] ?? 1);
            return <ol key={index} start={start}>{items.map((item, itemIndex) => <li key={itemIndex}><InlineText text={item} /></li>)}</ol>;
          }
          return <ul key={index}>{items.map((item, itemIndex) => <li key={itemIndex}><InlineText text={item} /></li>)}</ul>;
        }
        if (block.type === "takeaway") {
          return <p className="takeaway" key={index}><strong>Key takeaway:</strong> <InlineText text={block.text} /></p>;
        }
        if (block.type === "disclaimer") {
          return <p className="article-disclaimer" key={index}><InlineText text={block.text} /></p>;
        }
        if (block.type === "callout") {
          return <aside className="article-callout" key={index}><InlineText text={block.text} /></aside>;
        }
        return <p key={index}><InlineText text={block.text} /></p>;
      })}
    </div>
  );
}

export function ArticlePage({ slug, contentType = "resource" }: { slug: string; contentType?: "resource" | "guide" }) {
  const isGuide = contentType === "guide";
  const article = isGuide ? getGuide(slug) : getArticle(slug);
  if (!article) notFound();

  const articlePath = `/${isGuide ? "guides" : "resources"}/${slug}`;
  const collectionLabel = "Resources";
  const collectionPath = "/resources";
  const { minutes, wordCount } = getArticleReadingTime(article);
  const related = article.related
    .map((relatedSlug) => {
      const resource = resourceCards.find((item) => item.slug === relatedSlug);
      if (resource) return { slug: resource.slug, title: resource.title, href: `/resources/${resource.slug}` };
      const guide = getGuide(relatedSlug);
      return guide ? { slug: guide.slug, title: guide.title, href: `/guides/${guide.slug}` } : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const headings = article.blocks
    .map((block, index) => ({ ...block, index }))
    .filter((block) => block.type === "heading");
  const introIndex = article.blocks.findIndex((block) => block.type === "paragraph");
  const intro = introIndex >= 0 ? article.blocks[introIndex].text : undefined;
  const organization = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    ...(article.datePublished ? { datePublished: article.datePublished } : {}),
    ...(article.dateModified ? { dateModified: article.dateModified } : {}),
    image: `${PRODUCTION_URL}${article.image}`,
    ...(article.authorName ? {
      author: {
        "@type": "Organization",
        name: article.authorName,
      },
    } : {}),
    publisher: {
      "@type": "Organization",
      name: "CloverLoop",
      url: PRODUCTION_URL,
    },
    mainEntityOfPage: `${PRODUCTION_URL}${articlePath}`,
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: PRODUCTION_URL },
      { "@type": "ListItem", position: 2, name: collectionLabel, item: `${PRODUCTION_URL}${collectionPath}` },
      { "@type": "ListItem", position: 3, name: article.title, item: `${PRODUCTION_URL}${articlePath}` },
    ],
  };

  return (
    <>
      <ResourceViewEvent slug={slug} />
      <Breadcrumbs items={[
        { label: "Home", href: "/" },
        { label: collectionLabel, href: collectionPath },
        { label: article.category },
        { label: article.title },
      ]} />
      <article className="article-page">
        <header className="article-header reading-width">
          <span className="eyebrow">{article.category}</span>
          <h1>{article.title}</h1>
          {intro && <p className="article-intro"><InlineText text={intro} /></p>}
          <div className="article-meta">
            <span>{minutes} min read</span><span aria-hidden="true">·</span><span>{wordCount.toLocaleString()} words</span>
          </div>
          {article.authorName && (
            <div className="article-byline">
              <p>By {article.authorName}{article.publishedDate ? ` · Published ${article.publishedDate}` : ""}{article.lastReviewed ? ` · Last reviewed ${article.lastReviewed}` : ""}</p>
              {article.authorBio && <p>{article.authorBio}</p>}
            </div>
          )}
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
          <ArticleBlocks blocks={article.blocks.filter((_, index) => index !== introIndex)} slug={slug} />
          <div className="article-references">
            <h2>Explore related resources</h2>
            <ul>{related.map((item) => <li key={item.slug}><Link href={item.href}>{item.title} <ArrowRight size={14} /></Link></li>)}</ul>
            {slug === "digital-products" && <Link href="/sell-digital-downloads" className="subtle-link">Explore CloverLoop digital downloads <ArrowRight size={15} /></Link>}
            <div className="article-platform-links" aria-label="Explore CloverLoop">
              <Link href="/sell-digital-downloads">Digital Products</Link>
              <Link href="/courses">Courses</Link>
              <Link href="/pricing">Pricing</Link>
            </div>
            {!isGuide && (
              <TrackLink href="/signup" event="resource_cta_click" eventValue={slug} className="button">
                Get Started for Free <ArrowRight size={16} />
              </TrackLink>
            )}
          </div>
        </div>
      </article>
      {related.length > 0 && (
        <section className="related-resources section-space">
          <div className="page-width">
            <h2>Keep exploring</h2>
            <div className="related-resource-list">
              {related.slice(0, 3).map((item) => (
                <Link href={item.href} key={item.slug}>{item.title}<ArrowRight size={16} /></Link>
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
