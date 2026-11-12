import { createHash } from "node:crypto";
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
    lastUpdated: "11 November 2026",
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    seoTitle: "Privacy Policy | CloverLoop",
    description:
      "Learn how CloverLoop collects, uses, stores and shares personal data, and how to contact us about privacy requests.",
    lastUpdated: "11 November 2026",
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
  {
    slug: "creator-agreement",
    title: "CLOVERLOOP CREATOR AGREEMENT",
    seoTitle: "CloverLoop Creator Agreement v1.0",
    description:
      "Read the CloverLoop Creator Agreement v1.0, effective 12 November 2026.",
    lastUpdated: "12 November 2026",
    documentVersion: "1.0",
    effectiveDate: "12 November 2026",
    documentSha256: "01355e7aa82abdb264556fe9572a4675d70f7b1c055fdac02b2fd213a00f986c",
    documentPath: "creator-agreement-v1.0.md",
  },
] as const;

export type LegalPolicySummary = (typeof legalPolicyPages)[number];
export type LegalPolicy = LegalPolicySummary & { blocks: HelpBlock[] };

export function getLegalPolicy(slug: string): LegalPolicy | undefined {
  const policy = legalPolicyPages.find((item) => item.slug === slug);
  if (!policy) return undefined;

  const contentPath = "documentPath" in policy ? policy.documentPath : `${policy.slug}.md`;
  const content = readFileSync(path.join(process.cwd(), "content", "legal", contentPath), "utf8");
  if ("documentSha256" in policy) {
    const actualDigest = createHash("sha256").update(content.replace(/\r\n/g, "\n")).digest("hex");
    if (actualDigest !== policy.documentSha256) {
      throw new Error(`The immutable legal document ${contentPath} does not match its registered SHA-256 digest.`);
    }
  }
  const supportContact = SUPPORT_EMAIL || "[support team](/contact)";
  const displayContent = "documentVersion" in policy
    ? content.split(/\r?\n/).slice(5).join("\n")
    : content;
  return {
    ...policy,
    blocks: parseHelpMarkdown(displayContent.replace(/\{\{SUPPORT_EMAIL\}\}/g, supportContact)),
  };
}
