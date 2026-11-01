import fs from "node:fs";
import path from "node:path";
import { blocksToPlainText, parseHelpMarkdown, type HelpBlock } from "@/lib/help-markdown";
import { canonical } from "@/lib/site";

export type PublicationStatus = "published" | "draft";

export type HelpCategory = {
  slug: string;
  title: string;
  order: number;
  icon: string;
  href: string;
};

export type HelpArticle = {
  title: string;
  slug: string;
  category: string;
  order: number;
  description: string;
  status: PublicationStatus;
  lastUpdated: string;
  related: string[];
  editorialLabel?: string;
  reviewNote?: string;
  body: string;
  blocks: HelpBlock[];
  wordCount: number;
  readingTimeMinutes: number;
  href: string;
  url: string;
};

const CONTENT_DIR = path.join(process.cwd(), "content", "help");
const WORDS_PER_MINUTE = 200;

// A document category that has no route of its own redirects to the category that contains its articles.
export const CATEGORY_ALIASES: Record<string, string> = {
  "digital-product-delivery": "managing-products",
};

export const ESSENTIAL_GUIDE_SLUGS = [
  "how-cloverloop-works",
  "creating-your-cloverloop-account",
  "your-first-steps-on-cloverloop",
  "how-to-add-a-digital-product",
  "how-to-connect-razorpay-to-cloverloop",
  "understanding-cloverloop-pricing",
];

export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "";

function parseFrontMatter(raw: string) {
  const match = raw.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error("Help article is missing front matter");
  const data: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 1) continue;
    data[line.slice(0, idx).trim()] = JSON.parse(line.slice(idx + 1).trim());
  }
  return { data, body: match[2].trim() };
}

function categoryHref(slug: string) {
  return `/help-center/${slug}`;
}

let cache: { categories: HelpCategory[]; articles: HelpArticle[] } | null = null;

function load() {
  if (cache && process.env.NODE_ENV === "production") return cache;

  const rawCategories = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, "categories.json"), "utf8")) as {
    slug: string;
    title: string;
    order: number;
  }[];
  const icons = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, "category-icons.json"), "utf8")) as Record<string, string>;
  const categories = rawCategories
    .map((c) => ({ ...c, icon: icons[c.slug] ?? "BookOpen", href: categoryHref(c.slug) }))
    .sort((a, b) => a.order - b.order);

  const articles: HelpArticle[] = [];
  const seen = new Set<string>();
  for (const category of categories) {
    const dir = path.join(CONTENT_DIR, category.slug);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const { data, body } = parseFrontMatter(fs.readFileSync(path.join(dir, file), "utf8"));
      const slug = String(data.slug);
      const key = `${category.slug}/${slug}`;
      if (seen.has(key) || slug !== file.replace(/\.md$/, "")) throw new Error(`Invalid or duplicate help article: ${key}`);
      seen.add(key);
      const blocks = parseHelpMarkdown(body);
      const wordCount = blocksToPlainText(blocks).split(/\s+/).filter(Boolean).length;
      articles.push({
        title: String(data.title),
        slug,
        category: category.slug,
        order: Number(data.order),
        description: String(data.description),
        status: data.status === "published" ? "published" : "draft",
        lastUpdated: String(data.lastUpdated),
        related: (data.related as string[]) ?? [],
        editorialLabel: data.editorialLabel as string | undefined,
        reviewNote: data.reviewNote as string | undefined,
        body,
        blocks,
        wordCount,
        readingTimeMinutes: Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE)),
        href: `/help-center/${category.slug}/${slug}`,
        url: canonical(`/help-center/${category.slug}/${slug}`),
      });
    }
  }
  articles.sort((a, b) => a.order - b.order);
  cache = { categories, articles };
  return cache;
}

/** Only published articles are ever returned by the public helpers below. */
export function getPublishedArticles() {
  return load().articles.filter((a) => a.status === "published");
}

export function getCategories() {
  return load().categories;
}

export function getCategory(slug: string) {
  return load().categories.find((c) => c.slug === slug);
}

export function getCategoryArticles(categorySlug: string) {
  return getPublishedArticles().filter((a) => a.category === categorySlug);
}

export function getArticle(categorySlug: string, slug: string) {
  return getPublishedArticles().find((a) => a.category === categorySlug && a.slug === slug);
}

export function getArticleBySlug(slug: string) {
  return getPublishedArticles().find((a) => a.slug === slug);
}

export function getRelatedArticles(article: HelpArticle, limit = 3) {
  const published = getPublishedArticles();
  const explicit = article.related
    .map((slug) => published.find((a) => a.slug === slug))
    .filter((a): a is HelpArticle => Boolean(a) && a!.slug !== article.slug);
  const sameCategory = published.filter(
    (a) => a.category === article.category && a.slug !== article.slug && !explicit.includes(a),
  );
  return [...explicit, ...sameCategory].slice(0, limit);
}

/** Previous/next follow the global reading order of published articles. */
export function getAdjacentArticles(article: HelpArticle) {
  const published = getPublishedArticles();
  const index = published.findIndex((a) => a.category === article.category && a.slug === article.slug);
  return { previous: published[index - 1] ?? null, next: published[index + 1] ?? null };
}

export function getEssentialGuides() {
  return ESSENTIAL_GUIDE_SLUGS.map(getArticleBySlug).filter((a): a is HelpArticle => Boolean(a));
}

export function getReferencesMarkdown() {
  const file = path.join(CONTENT_DIR, "references.md");
  return fs.existsSync(file) ? parseHelpMarkdown(fs.readFileSync(file, "utf8")) : [];
}

export function getSearchIndex() {
  const categories = new Map(getCategories().map((c) => [c.slug, c.title]));
  return getPublishedArticles().map((a) => ({
    title: a.title,
    description: a.description,
    category: categories.get(a.category) ?? "",
    href: a.href,
    text: blocksToPlainText(a.blocks),
  }));
}

export type HelpSearchEntry = ReturnType<typeof getSearchIndex>[number];
