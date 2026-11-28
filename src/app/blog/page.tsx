import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
        <div className="section-heading blog-index-heading">
          <span className="eyebrow">CloverLoop Blog</span>
          <h1>Practical guides for creators selling digital products in India</h1>
          <p>
            Explore clear, useful editorial guides on digital downloads, templates, notes and creator offers tailored to Indian sellers.
          </p>
        </div>
        <div className="resource-card-grid">
          {articles.map((article) => (
            <Link href={`/blog/${article.slug}`} className="resource-card" key={article.slug}>
              {article.image ? (
                <div className="resource-card-image">
                  <Image src={article.image} alt={article.imageAlt || article.title} width={1376} height={768} sizes="(max-width: 700px) 100vw, 30vw" />
                </div>
              ) : null}
              {article.category ? <span className="eyebrow">{article.category}</span> : null}
              <h2>{article.title}</h2>
              {article.description ? <p>{article.description}</p> : null}
              <span className="resource-card-link">Read the guide <ArrowRight size={15} aria-hidden="true" /></span>
            </Link>
          ))}
        </div>
      </main>
    </PublicLayout>
  );
}
