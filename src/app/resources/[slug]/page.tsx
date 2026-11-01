import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicLayout } from "@/components/public-layout";
import { ArticlePage } from "@/components/article-content";
import { MarketingIdeasTool } from "@/components/marketing-ideas-tool";
import { getArticle, getArticleSlugs } from "@/lib/resources";
import { marketingPrinciples } from "@/lib/marketing-ideas";
import { canonical, resourceCards } from "@/lib/site";
import { Breadcrumbs } from "@/components/site-header";
import { PublicCta } from "@/components/public-cta";
import { TrackLink } from "@/components/track-link";
import Image from "next/image";

export function generateStaticParams() {
  return resourceCards.map(({ slug }) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (slug === "marketing-ideas-tool") {
    return {
      title: "Digital Product Marketing Ideas Generator",
      description: "Discover practical marketing ideas to promote ebooks, presets, templates, printables and other digital products.",
      alternates: { canonical: canonical(`/resources/${slug}`) },
      robots: { index: true, follow: true },
      openGraph: {
        title: "Digital Product Marketing Ideas Generator",
        description: "Discover practical marketing ideas to promote digital products.",
        url: canonical(`/resources/${slug}`),
        images: ["/images/resources/marketing-ideas-tool.webp"],
      },
      twitter: {
        card: "summary_large_image",
        title: "Digital Product Marketing Ideas Generator",
        description: "Discover practical marketing ideas to promote digital products.",
        images: ["/images/resources/marketing-ideas-tool.webp"],
      },
    };
  }
  const article = getArticle(slug);
  if (!article) return {};
  return {
    title: article.seoTitle,
    description: article.description,
    alternates: { canonical: article.canonicalUrl },
    robots: article.indexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title: article.seoTitle,
      description: article.description,
      url: canonical(`/resources/${slug}`),
      images: [article.image],
      type: "article",
    },
    twitter: { card: "summary_large_image", title: article.seoTitle, description: article.description, images: [article.image] },
  };
}

function ToolPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Resources", href: "/resources" }, { label: "Marketing ideas tool" }]} />
      <section className="tool-hero page-width">
        <div>
          <span className="eyebrow">Free creator tool</span>
          <h1>Digital product marketing ideas generator</h1>
          <p>
            Selling a digital product is only one part of building a digital
            product business. You also need a repeatable way to reach potential
            customers, explain the value of your product and encourage people to
            take the next step.
          </p>
          <p>
            Explore ideas based on your creator category, product type and
            preferred channel. Suggestions are predefined and generated locally
            in your browser.
          </p>
        </div>
        <Image src="/images/resources/marketing-ideas-tool.webp" alt="Marketing ideas for independent digital product creators" width={1376} height={768} priority sizes="(max-width: 760px) 100vw, 45vw" />
      </section>
      <section className="section-space page-width">
        <MarketingIdeasTool />
      </section>
      <section className="section-space principles-section page-width">
        <div className="reading-width">
          <h2>Ten repeatable marketing principles</h2>
          <ol>{marketingPrinciples.map((principle) => <li key={principle}>{principle}</li>)}</ol>
        </div>
      </section>
      <div className="reading-width tool-cta">
        <TrackLink href="/signup" event="resource_cta_click" eventValue="marketing-ideas-tool" className="button">Get Started for Free</TrackLink>
      </div>
      <PublicCta />
    </>
  );
}

export default async function ResourcePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!resourceCards.some((resource) => resource.slug === slug)) notFound();
  if (slug === "marketing-ideas-tool") return <PublicLayout><ToolPage /></PublicLayout>;
  if (!getArticleSlugs().includes(slug)) notFound();
  return <PublicLayout><ArticlePage slug={slug} /></PublicLayout>;
}
