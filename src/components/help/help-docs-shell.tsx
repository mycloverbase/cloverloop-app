import type { ReactNode } from "react";
import { HelpSidebar } from "@/components/help/help-sidebar";
import { HelpSearch } from "@/components/help/help-search";
import { getCategories, getPublishedArticles } from "@/lib/help";

export function HelpDocsShell({
  currentCategory,
  currentArticle,
  aside,
  children,
}: {
  currentCategory?: string;
  currentArticle?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const categories = getCategories();
  const articlesByCategory: Record<string, { slug: string; title: string; href: string }[]> = {};
  for (const article of getPublishedArticles()) {
    (articlesByCategory[article.category] ??= []).push({ slug: article.slug, title: article.title, href: article.href });
  }
  return (
    <div className="page-width help-docs">
      <div className="help-docs-search"><HelpSearch /></div>
      <HelpSidebar
        categories={categories}
        articlesByCategory={articlesByCategory}
        currentCategory={currentCategory}
        currentArticle={currentArticle}
      />
      <div className="help-docs-main">{children}</div>
      {aside && <aside className="help-docs-aside">{aside}</aside>}
    </div>
  );
}
