import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

type TextBlock = {
  type: "paragraph" | "heading" | "subheading" | "takeaway" | "disclaimer" | "callout";
  text: string;
};

type ListBlock = {
  type: "ordered-list" | "unordered-list";
  text: string;
  items?: string[];
  start?: number;
};

type TableBlock = {
  type: "table";
  text: string;
  headers: string[];
  rows: string[][];
};

export type CtaBlock = {
  type: "cta";
  text: string;
  label: string;
  href: string;
};

export type ResourceBlock = TextBlock | ListBlock | TableBlock | CtaBlock;

export type ResourceArticle = {
  slug: string;
  title: string;
  seoTitle: string;
  description: string;
  primaryKeyword: string;
  category: string;
  canonicalUrl: string;
  indexable: boolean;
  image: string;
  imageAlt: string;
  related: string[];
  datePublished?: string;
  dateModified?: string;
  publishedDate?: string;
  lastReviewed?: string;
  authorName?: string;
  authorBio?: string;
  blocks: ResourceBlock[];
};

const resourceDirectory = path.join(process.cwd(), "content", "resources");

export function getArticleSlugs() {
  return readdirSync(resourceDirectory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -5));
}

export function getArticle(slug: string): ResourceArticle | null {
  if (!getArticleSlugs().includes(slug)) return null;
  const contents = readFileSync(path.join(resourceDirectory, `${slug}.json`), "utf8");
  return JSON.parse(contents) as ResourceArticle;
}

export function getArticleReadingTime(article: ResourceArticle) {
  const text = article.blocks.map((block) => {
    if (block.type === "table") {
      return [block.text, ...block.headers, ...block.rows.flat()].join(" ");
    }
    if (block.type === "ordered-list" || block.type === "unordered-list") {
      return (block.items ?? block.text.split(/\r?\n/)).join(" ");
    }
    return block.text;
  }).join(" ");
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return { wordCount, minutes: Math.max(1, Math.ceil(wordCount / 200)) };
}
