import { readFileSync } from "node:fs";
import path from "node:path";
import { parseHelpMarkdown, type HelpBlock } from "@/lib/help-markdown";
import { SUPPORT_EMAIL } from "@/lib/help";

export const legalPolicyPages = [
  {
    slug: "terms",
    title: "Terms of Use",
    seoTitle: "Terms of Use | CloverLoop",
    description:
      "Read the terms that govern access to and use of CloverLoop, including creator accounts, plans, fees, content, purchases and disputes.",
    lastUpdated: "2 November 2026",
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    seoTitle: "Privacy Policy | CloverLoop",
    description:
      "Learn how CloverLoop collects, uses, stores and shares personal data, and how to contact us about privacy requests.",
    lastUpdated: "2 November 2026",
  },
  {
    slug: "refunds",
    title: "Refund & Cancellation Policy",
    seoTitle: "Refund & Cancellation Policy | CloverLoop",
    description:
      "Review refund, cancellation, renewal and payment-dispute information for CloverLoop plans and purchases from creators.",
    lastUpdated: "2 November 2026",
  },
  {
    slug: "cookies",
    title: "Cookie Policy",
    seoTitle: "Cookie Policy | CloverLoop",
    description:
      "Learn about cookies, analytics and similar technologies used by CloverLoop and how to manage optional analytics choices.",
    lastUpdated: "2 November 2026",
  },
  {
    slug: "disclaimer",
    title: "Disclaimer",
    seoTitle: "Disclaimer | CloverLoop",
    description:
      "Read CloverLoop's disclaimer covering platform information, third-party services, creator content, availability and liability.",
    lastUpdated: "2 November 2026",
  },
] as const;

export type LegalPolicySummary = (typeof legalPolicyPages)[number];
export type LegalPolicy = LegalPolicySummary & { blocks: HelpBlock[] };

export function getLegalPolicy(slug: string): LegalPolicy | undefined {
  const policy = legalPolicyPages.find((item) => item.slug === slug);
  if (!policy) return undefined;

  const content = readFileSync(
    path.join(process.cwd(), "content", "legal", `${policy.slug}.md`),
    "utf8",
  );
  const supportContact = SUPPORT_EMAIL || "[support team](/contact)";
  return {
    ...policy,
    blocks: parseHelpMarkdown(content.replace(/\{\{SUPPORT_EMAIL\}\}/g, supportContact)),
  };
}
