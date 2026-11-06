import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { ResourceArticle } from "@/lib/resources";

const guideDirectory = path.join(process.cwd(), "content", "guides");

export function getGuideSlugs() {
  return readdirSync(guideDirectory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -5));
}

export function getGuide(slug: string): ResourceArticle | null {
  if (!getGuideSlugs().includes(slug)) return null;
  const contents = readFileSync(path.join(guideDirectory, `${slug}.json`), "utf8");
  return JSON.parse(contents) as ResourceArticle;
}
