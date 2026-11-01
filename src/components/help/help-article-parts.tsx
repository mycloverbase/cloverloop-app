import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock, Mail } from "lucide-react";
import { HelpBlocks } from "@/components/help/help-content";
import type { HelpArticle } from "@/lib/help";
import type { HelpBlock } from "@/lib/help-markdown";

export function HelpBreadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="help-breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {index > 0 && <span aria-hidden="true">/</span>}
            {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function TableOfContents({ blocks }: { blocks: HelpBlock[] }) {
  const headings = blocks.flatMap((b) => (b.type === "heading" && b.level === 2 ? [b] : []));
  if (headings.length < 4) return null;
  return (
    <nav className="help-toc" aria-label="On this page">
      <p>On this page</p>
      <ol>
        {headings.map((h) => (
          <li key={h.id}><a href={`#${h.id}`}>{h.text}</a></li>
        ))}
      </ol>
    </nav>
  );
}

export function RelatedArticles({ articles }: { articles: Pick<HelpArticle, "title" | "href" | "description">[] }) {
  if (!articles.length) return null;
  return (
    <section className="help-related" aria-labelledby="help-related-heading">
      <h2 id="help-related-heading">Related articles</h2>
      <ul>
        {articles.map((a) => (
          <li key={a.href}><Link href={a.href}>{a.title}</Link></li>
        ))}
      </ul>
    </section>
  );
}

export function PrevNext({ previous, next }: { previous: HelpArticle | null; next: HelpArticle | null }) {
  if (!previous && !next) return null;
  return (
    <nav className="help-prevnext" aria-label="Article navigation">
      {previous ? (
        <Link href={previous.href} rel="prev">
          <span><ArrowLeft size={14} aria-hidden="true" /> Previous</span>
          <strong>{previous.title}</strong>
        </Link>
      ) : <span />}
      {next ? (
        <Link href={next.href} rel="next" className="is-next">
          <span>Next <ArrowRight size={14} aria-hidden="true" /></span>
          <strong>{next.title}</strong>
        </Link>
      ) : <span />}
    </nav>
  );
}

export function SupportCallout({ email }: { email: string }) {
  return (
    <section className="help-support" aria-labelledby="help-support-heading">
      <Mail size={20} aria-hidden="true" />
      <div>
        <h2 id="help-support-heading">Contact support</h2>
        {email ? (
          <p>Still need help? Email <a href={`mailto:${email}`}>{email}</a>.</p>
        ) : (
          <p>The CloverLoop support email will be shown here once it is configured.</p>
        )}
      </div>
    </section>
  );
}

export function ArticleBody({ article }: { article: HelpArticle }) {
  const firstHeading = article.blocks.findIndex((b) => b.type === "heading");
  const split = firstHeading === -1 ? article.blocks.length : firstHeading;
  return (
    <>
      <div className="help-intro"><HelpBlocks blocks={article.blocks.slice(0, split)} /></div>
      <HelpBlocks blocks={article.blocks.slice(split)} />
    </>
  );
}

export function ReadingTime({ minutes }: { minutes: number }) {
  return (
    <span className="help-meta-item"><Clock size={14} aria-hidden="true" /> {minutes} min read</span>
  );
}
