import { readFileSync } from "node:fs";
import path from "node:path";
import { blocksToPlainText, parseHelpMarkdown, type HelpBlock } from "@/lib/help-markdown";

export type ComparisonFaq = { question: string; answer: string };

export const comparisonArticles = [
  {
    slug: "cloverloop-vs-superprofile",
    title: "CloverLoop vs SuperProfile: Selling Digital Products in India",
    seoTitle: "CloverLoop vs SuperProfile: Pricing and Features for India",
    description:
      "Compare CloverLoop and SuperProfile pricing, platform fees, creator tools and payment terms using current official pricing information.",
    summary:
      "A practical comparison of CloverLoop's INR digital-product plans and SuperProfile's currently published USD pricing and creator toolkit.",
    reviewedOn: "2 November 2026",
    reviewedOnISO: "2026-11-02",
  },
  {
    slug: "cloverloop-vs-gumroad",
    title: "CloverLoop vs Gumroad: Fees, Tax Handling and Digital Products",
    seoTitle: "CloverLoop vs Gumroad: Compare Fees and Features",
    description:
      "Compare CloverLoop and Gumroad direct-sale fees, Discover charges, payment processing, tax handling and digital-product tools.",
    summary:
      "Compare CloverLoop's GST-inclusive commission with Gumroad's fixed USD direct-sale fee, Discover marketplace fee and Merchant of Record service.",
    reviewedOn: "2 November 2026",
    reviewedOnISO: "2026-11-02",
  },
  {
    slug: "cloverloop-vs-payhip",
    title: "CloverLoop vs Payhip: Plans and Fees for Digital Products",
    seoTitle: "CloverLoop vs Payhip: Pricing, Plans and Features",
    description:
      "Compare CloverLoop and Payhip plans, platform transaction fees, USD subscriptions, payment processing and digital-product features.",
    summary:
      "Compare CloverLoop's INR plans with Payhip's USD Free, Plus and Pro tiers, including processor fees and tax-basis considerations.",
    reviewedOn: "2 November 2026",
    reviewedOnISO: "2026-11-02",
  },
  {
    slug: "cloverloop-vs-instamojo",
    title: "CloverLoop vs Instamojo: Digital Products and Online Store Fees",
    seoTitle: "CloverLoop vs Instamojo: Current Pricing and Fees",
    description:
      "Compare CloverLoop and Instamojo plan fees, GST, subscriptions and ecommerce trade-offs using Instamojo's current official pricing.",
    summary:
      "Compare CloverLoop's digital-product plan fees with Instamojo's current Online Store rates, including percentage-plus-fixed charges and GST.",
    reviewedOn: "2 November 2026",
    reviewedOnISO: "2026-11-02",
  },
] as const;

export type ComparisonArticleSummary = (typeof comparisonArticles)[number];

export type ComparisonArticle = ComparisonArticleSummary & {
  blocks: HelpBlock[];
  bodyText: string;
  faqs: ComparisonFaq[];
};

function extractFaqs(blocks: HelpBlock[]): ComparisonFaq[] {
  const start = blocks.findIndex(
    (block) => block.type === "heading" && block.level === 2 && block.text === "Frequently asked questions",
  );
  if (start < 0) return [];

  const faqs: ComparisonFaq[] = [];
  let current: ComparisonFaq | undefined;
  for (const block of blocks.slice(start + 1)) {
    if (block.type === "heading" && block.level === 2) break;
    if (block.type === "heading" && block.level === 3) {
      if (current) faqs.push(current);
      current = { question: block.text, answer: "" };
    } else if (current && block.type === "paragraph") {
      current.answer = [current.answer, block.text].filter(Boolean).join(" ");
    }
  }
  if (current) faqs.push(current);
  return faqs;
}

export function getComparisonArticle(slug: string): ComparisonArticle | undefined {
  const summary = comparisonArticles.find((article) => article.slug === slug);
  if (!summary) return undefined;

  const source = readFileSync(
    path.join(process.cwd(), "content", "comparisons", `${summary.slug}.md`),
    "utf8",
  );
  const blocks = parseHelpMarkdown(source);
  return {
    ...summary,
    blocks,
    bodyText: blocksToPlainText(blocks),
    faqs: extractFaqs(blocks),
  };
}
