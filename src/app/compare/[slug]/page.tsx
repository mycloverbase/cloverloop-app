import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicLayout } from "@/components/public-layout";
import { ComparisonArticlePage } from "@/components/comparison-article-page";
import { comparisonArticles, getComparisonArticle } from "@/lib/comparisons";
import { canonical } from "@/lib/site";

export function generateStaticParams() {
  return comparisonArticles.map(({ slug }) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getComparisonArticle(slug);
  if (!article) return {};
  const url = canonical(`/compare/${slug}`);
  const image = "/images/home/hero.webp";
  return {
    title: article.seoTitle,
    description: article.description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      title: article.seoTitle,
      description: article.description,
      url,
      siteName: "CloverLoop",
      images: [image],
      modifiedTime: `${article.reviewedOnISO}T00:00:00.000Z`,
    },
    twitter: {
      card: "summary_large_image",
      title: article.seoTitle,
      description: article.description,
      images: [image],
    },
  };
}

export default async function ComparisonArticleRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getComparisonArticle(slug);
  if (!article) notFound();
  return <PublicLayout><ComparisonArticlePage article={article} /></PublicLayout>;
}
