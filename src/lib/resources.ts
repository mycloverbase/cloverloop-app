import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type ResourceBlock = {
  type: "paragraph" | "heading" | "subheading" | "takeaway" | "disclaimer";
  text: string;
};

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
  const text = article.blocks.map((block) => block.text).join(" ");
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return { wordCount, minutes: Math.max(1, Math.ceil(wordCount / 200)) };
}
