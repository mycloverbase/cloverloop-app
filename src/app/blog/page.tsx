import type { Metadata } from "next";
import Link from "next/link";
import { PublicLayout } from "@/components/public-layout";
import { getBlogArticles } from "@/lib/blog";
import { Breadcrumbs } from "@/components/site-header";

export const metadata: Metadata = {
  title: "CloverLoop Blog | Guides for Indian creators",
  description: "Practical guides for creators selling digital products, templates, notes and study resources in India.",
  alternates: { canonical: "https://cloverloop.in/blog" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "CloverLoop Blog",
    description: "Practical guides for creators selling digital products, templates, notes and study resources in India.",
    url: "https://cloverloop.in/blog",
    type: "website",
  },
};

export default function BlogIndexPage() {
  const articles = getBlogArticles();

  return (
    <PublicLayout>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Blog" }]} />
      <main className="page-width section-space">
        <div className="reading-width">
          <span className="eyebrow">CloverLoop Blog</span>
          <h1>Practical guides for creators selling digital products in India</h1>
          <p>
            Explore clear, useful editorial guides on digital downloads, templates, notes and creator offers tailored to Indian sellers.
          </p>
        </div>
        <div className="related-resource-list" style={{ marginTop: "2rem" }}>
          {articles.map((article) => (
            <Link href={`/blog/${article.slug}`} key={article.slug}>{article.title}</Link>
          ))}
        </div>
      </main>
    </PublicLayout>
  );
}
