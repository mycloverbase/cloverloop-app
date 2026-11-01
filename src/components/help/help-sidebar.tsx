import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { CategoryIcon } from "@/components/help/help-content";
import type { HelpArticle, HelpCategory } from "@/lib/help";

type Props = {
  categories: HelpCategory[];
  articlesByCategory: Record<string, Pick<HelpArticle, "slug" | "title" | "href">[]>;
  currentCategory?: string;
  currentArticle?: string;
};

function NavList({ categories, articlesByCategory, currentCategory, currentArticle }: Props) {
  return (
    <ul className="help-nav-list">
      {categories.map((category) => {
        const articles = articlesByCategory[category.slug] ?? [];
        const active = category.slug === currentCategory;
        return (
          <li key={category.slug}>
            <details open={active} className="help-nav-group">
              <summary className={active ? "is-active" : undefined}>
                <CategoryIcon name={category.icon} size={16} />
                <span>{category.title}</span>
                <ChevronDown size={15} aria-hidden="true" className="help-nav-chevron" />
              </summary>
              <ul>
                <li>
                  <Link href={category.href} aria-current={active && !currentArticle ? "page" : undefined}>
                    All {category.title} articles
                  </Link>
                </li>
                {articles.map((article) => (
                  <li key={article.slug}>
                    <Link
                      href={article.href}
                      aria-current={active && article.slug === currentArticle ? "page" : undefined}
                    >
                      {article.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

export function HelpSidebar(props: Props) {
  return (
    <>
      <details className="help-mobile-nav">
        <summary>
          <span>Browse help topics</span>
          <ChevronDown size={17} aria-hidden="true" />
        </summary>
        <nav aria-label="Help topics">
          <NavList {...props} />
        </nav>
      </details>
      <nav className="help-sidebar" aria-label="Help categories">
        <NavList {...props} />
      </nav>
    </>
  );
}
