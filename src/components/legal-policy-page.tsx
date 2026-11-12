import Link from "next/link";
import { Breadcrumbs } from "@/components/site-header";
import { HelpBlocks } from "@/components/help/help-content";
import { getLegalPolicy, legalPolicyPages } from "@/lib/legal-policies";

const relatedPolicies: Record<string, { slug: string; label: string }[]> = {
  terms: [
    { slug: "privacy", label: "Privacy Policy" },
    { slug: "refunds", label: "Refund & Cancellation Policy" },
  ],
  privacy: [{ slug: "cookies", label: "Cookie Policy" }],
  refunds: [{ slug: "terms", label: "Terms of Use" }],
  cookies: [{ slug: "privacy", label: "Privacy Policy" }],
  disclaimer: [
    { slug: "terms", label: "Terms of Use" },
    { slug: "privacy", label: "Privacy Policy" },
  ],
};

export function LegalPolicyPage({ slug }: { slug: string }) {
  const policy = getLegalPolicy(slug);
  if (!policy) return null;

  const headings = policy.blocks.filter((block) => block.type === "heading");
  const related = relatedPolicies[slug] ?? [];
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: policy.title }]} />
      <article className="legal-document reading-width">
        <header className="legal-document-header">
          <span className="eyebrow">Legal</span>
          <h1>{policy.title}</h1>
          <p>
            {"documentVersion" in policy ? (
              <>Version {policy.documentVersion} · Effective {policy.effectiveDate} · Last updated {policy.lastUpdated}</>
            ) : (
              <>Last updated: {policy.lastUpdated}</>
            )}
          </p>
        </header>
        {headings.length > 0 && (
          <nav className="legal-toc" aria-label="Table of contents">
            <details>
              <summary>On this page</summary>
              <ol>
                {headings.map((heading) => (
                  <li
                    className={heading.level === 3 ? "legal-toc-subsection" : undefined}
                    key={heading.id}
                  >
                    <a href={`#${heading.id}`}>{heading.text}</a>
                  </li>
                ))}
              </ol>
            </details>
          </nav>
        )}
        <div className="legal-policy-body help-article-body">
          <HelpBlocks blocks={policy.blocks} />
        </div>
        {related.length > 0 && (
          <nav className="legal-related" aria-label="Related policies">
            <h2>Related policies</h2>
            <ul>
              {related.map((item) => {
                const target = legalPolicyPages.find((candidate) => candidate.slug === item.slug);
                return target ? (
                  <li key={item.slug}><Link href={`/${item.slug}`}>{item.label}</Link></li>
                ) : null;
              })}
            </ul>
          </nav>
        )}
      </article>
    </>
  );
}
