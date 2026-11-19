import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getBlogArticle } from "@/lib/blog";
import { getArticleReadingTime } from "@/lib/resources";

describe("creator economy blog articles", () => {
  it.each([
    "how-much-do-content-creators-earn-in-india-2027",
    "indian-creator-economy-statistics-2027",
  ])("loads %s with readable content and available chart assets", (slug) => {
    const article = getBlogArticle(slug);
    if (!article) throw new Error(`Missing blog article: ${slug}`);

    expect(article.blocks.length).toBeGreaterThan(0);
    expect(getArticleReadingTime(article).wordCount).toBeGreaterThan(0);

    const imageBlocks = article.blocks.filter((block) => block.type === "image");
    expect(imageBlocks.length).toBeGreaterThan(0);
    for (const block of imageBlocks) {
      expect(existsSync(path.join(process.cwd(), "public", block.src.slice(1)))).toBe(true);
    }
  });
});
