import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticlePage } from "@/components/article-content";
import { PublicLayout } from "@/components/public-layout";
import { getGuide, getGuideSlugs } from "@/lib/guides";

export function generateStaticParams() {
  return getGuideSlugs().map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getGuide(slug);
  if (!article) return {};

  return {
    title: article.seoTitle,
    description: article.description,
    alternates: { canonical: article.canonicalUrl },
    robots: article.indexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title: article.seoTitle,
      description: article.description,
      url: article.canonicalUrl,
      images: [{ url: article.image, alt: article.imageAlt }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: article.seoTitle,
      description: article.description,
      images: [article.image],
    },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getGuide(slug)) notFound();
  return <PublicLayout><ArticlePage slug={slug} contentType="guide" /></PublicLayout>;
}
