import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { ResourceArticle } from "@/lib/resources";

const blogDirectory = path.join(process.cwd(), "content", "blog");

export function getBlogSlugs() {
  return readdirSync(blogDirectory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -5));
}

export function getBlogArticle(slug: string): ResourceArticle | null {
  if (!getBlogSlugs().includes(slug)) return null;
  const contents = readFileSync(path.join(blogDirectory, `${slug}.json`), "utf8");
  return JSON.parse(contents) as ResourceArticle;
}

export function getBlogArticles(): ResourceArticle[] {
  return getBlogSlugs()
    .map((slug) => getBlogArticle(slug))
    .filter((article): article is ResourceArticle => article !== null);
}
