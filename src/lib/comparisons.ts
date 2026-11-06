import { readFileSync } from "node:fs";
import path from "node:path";
import { blocksToPlainText, parseHelpMarkdown, type HelpBlock } from "@/lib/help-markdown";

export type ComparisonFaq = { question: string; answer: string };

export const comparisonArticles = [
  {
    slug: "cloverloop-vs-superprofile",
    title: "CloverLoop vs SuperProfile: Selling Digital Products in India",
    seoTitle: "CloverLoop vs SuperProfile: India Pricing and Fees",
    description:
      "Compare CloverLoop's published INR plans and Free-plan Gross Sales allowance with SuperProfile India's subscription, platform fee, creator tools and payment terms.",
    summary:
      "Compare CloverLoop's published INR plans with SuperProfile India's ₹99 intro offer, ₹499 Creator subscription and 5% fee for Indian subscribers.",
    reviewedOn: "6 November 2026",
    reviewedOnISO: "2026-11-06",
  },
  {
    slug: "superprofile-alternative-india-2026",
    title: "SuperProfile Alternative India (2026): Pricing, Fees and Comparison",
    seoTitle: "SuperProfile Alternative India (2026): Pricing and Fees",
    description:
      "SuperProfile India lists Creator at ₹499/month after its intro offer, plus a 5% fee for subscribers. Compare fees, GST and estimated costs with CloverLoop.",
    summary:
      "Compare SuperProfile India's ₹499 Creator subscription and 5% fee for Indian subscribers with CloverLoop plans, taxes, payment processing and estimated total costs.",
    reviewedOn: "6 November 2026",
    reviewedOnISO: "2026-11-06",
  },
  {
    slug: "cloverloop-vs-gumroad",
    title: "CloverLoop vs Gumroad: Fees, Tax Handling and Digital Products",
    seoTitle: "CloverLoop vs Gumroad: Compare Fees and Features",
    description:
      "Compare CloverLoop's published plans and Free-plan Gross Sales allowance with Gumroad direct-sale fees, Discover charges, payment processing, tax handling and digital-product tools.",
    summary:
      "Compare CloverLoop's INR plan rates and Free-plan Gross Sales allowance with Gumroad's fixed USD direct-sale fee, Discover marketplace fee and Merchant of Record service.",
    reviewedOn: "2 November 2026",
    reviewedOnISO: "2026-11-02",
  },
  {
    slug: "cloverloop-vs-payhip",
    title: "CloverLoop vs Payhip: Plans and Fees for Digital Products",
    seoTitle: "CloverLoop vs Payhip: Pricing, Plans and Features",
    description:
      "Compare CloverLoop's published plans and Free-plan Gross Sales allowance with Payhip fees, USD subscriptions, payment processing and digital-product features.",
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
      "Compare CloverLoop's published plans with Instamojo plan fees, subscriptions and ecommerce trade-offs using its current official pricing.",
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
