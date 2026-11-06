import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Mail } from "lucide-react";
import { CategoryIcon } from "@/components/help/help-content";
import { HelpSearch } from "@/components/help/help-search";
import { getCategories, getCategoryArticles, getEssentialGuides, SUPPORT_EMAIL } from "@/lib/help";
import { canonical } from "@/lib/site";

const TITLE = "CloverLoop Help Centre | Guides for Digital Product Creators";
const DESCRIPTION =
  "Find practical guides to setting up your CloverLoop account, managing digital products, building your storefront and understanding payments and account security.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: canonical("/help-center") },
  robots: { index: true, follow: true },
  openGraph: { type: "website", title: TITLE, description: DESCRIPTION, url: canonical("/help-center") },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default function HelpCenterHome() {
  const categories = getCategories().map((c) => ({ ...c, count: getCategoryArticles(c.slug).length }));
  const essentials = getEssentialGuides();

  return (
    <>
      <section className="help-hero">
        <div className="page-width">
          <h1>Find Answers and Get More from CloverLoop</h1>
          <p>
            Welcome to the CloverLoop Help Centre. This is where creators can find information about
            using CloverLoop to organise, present and sell digital products online. Whether you are
            preparing your first digital download or managing products in an existing storefront,
            use these guides to understand the platform and find answers to common questions.
          </p>
          <p>
            CloverLoop is designed for creators who want a dedicated place to offer digital products
            such as ebooks, PDFs, templates, learning materials and audio files. The Help Centre
            brings key topics together so you can find relevant information without searching
            through unrelated resources.
          </p>
          <HelpSearch variant="hero" />
        </div>
      </section>

      <section className="page-width help-section help-overview" aria-label="Help Centre guides">
        <div className="reading-width">
          <section aria-labelledby="help-getting-started">
            <h2 id="help-getting-started">Getting started</h2>
            <p>
              Start with the <Link href="/help-center/getting-started">Getting Started guide</Link> for
              an introduction to the platform and the basic steps involved in setting up your
              creator presence. Explore the Help Centre categories below to find guidance for your
              next step.
            </p>
          </section>
          <section aria-labelledby="help-products">
            <h2 id="help-products">Creating and managing products</h2>
            <p>
              Your digital products are the core of your creator storefront. The{" "}
              <Link href="/help-center/managing-products">Products and Digital Downloads guide</Link>{" "}
              covers product management and information to understand when preparing digital files
              for distribution.
            </p>
            <p>
              When planning a product, consider its format, the value it provides to the buyer and
              how clearly the product page explains what is included. Accurate descriptions and
              suitable preview material help customers understand what they are purchasing.
            </p>
            <p>
              If you want to offer a resource at no cost, read the{" "}
              <Link href="/help-center/free-products">Free Products guide</Link> for information
              about free product listings.
            </p>
          </section>
          <section aria-labelledby="help-storefronts">
            <h2 id="help-storefronts">Storefronts and presentation</h2>
            <p>
              A creator storefront gives your digital products a dedicated place to be discovered.
              The <Link href="/store-builder">Creator Store Builder</Link> is the relevant starting
              point for understanding the storefront experience. Keep product names, descriptions
              and presentation consistent so visitors can quickly understand what each item offers.
            </p>
          </section>
          <section aria-labelledby="help-payments">
            <h2 id="help-payments">Payments and settlements</h2>
            <p>
              Payment setup and settlement information are important parts of selling online. Read
              the <Link href="/help-center/razorpay-setup">Razorpay Setup guide</Link> for available
              setup guidance, and the{" "}
              <Link href="/help-center/payments-and-settlements">Payments and Settlements guide</Link>{" "}
              for related information.
            </p>
            <p>
              Payment processing, settlement timing and account requirements may depend on the
              payment provider and your account configuration. Refer to the applicable provider
              documentation for account-specific or time-sensitive details.
            </p>
          </section>
          <section aria-labelledby="help-security">
            <h2 id="help-security">Account access and security</h2>
            <p>
              For help with account access, sign-in and security topics, visit{" "}
              <Link href="/help-center/account-and-security">Account and Security</Link>. If you use
              Google authentication, the{" "}
              <Link href="/help-center/account-and-security/logging-in-and-using-google-authentication">
                Logging In and Using Google Authentication guide
              </Link>{" "}
              provides more specific guidance.
            </p>
            <p>Use a secure password where applicable and keep access to your account and associated email address protected.</p>
          </section>
          <section aria-labelledby="help-troubleshooting">
            <h2 id="help-troubleshooting">Troubleshooting</h2>
            <p>
              If something does not work as expected, start with the{" "}
              <Link href="/help-center/troubleshooting">Troubleshooting guide</Link>. Check that
              you are signed in to the correct account, that the information entered is accurate
              and that any relevant file or payment-provider requirements have been met.
            </p>
            <p>
              For issues that remain unresolved, use the support contact or support route already
              provided on the CloverLoop website. Include a clear description of the issue and the
              steps that led to it. Do not include passwords, payment credentials or other sensitive
              information in a support request.
            </p>
          </section>
          <section aria-labelledby="help-find-guide">
            <h2 id="help-find-guide">Find the right guide</h2>
            <p>
              Use the Help Centre navigation to move between getting started, product management,
              free products, payment setup, settlements, account security and troubleshooting. We
              will continue to organise guidance around the questions creators encounter while
              managing digital products.
            </p>
          </section>
        </div>
      </section>

      <section className="page-width help-section" aria-labelledby="help-categories">
        <h2 id="help-categories">Browse by category</h2>
        <ul className="help-category-grid">
          {categories.map((category) => (
            <li key={category.slug}>
              <Link href={category.href} className="help-category-card">
                <span className="help-category-icon"><CategoryIcon name={category.icon} /></span>
                <h3>{category.title}</h3>
                <p>{category.count} {category.count === 1 ? "article" : "articles"}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {essentials.length > 0 && (
        <section className="page-width help-section" aria-labelledby="help-essentials">
          <h2 id="help-essentials">Essential guides</h2>
          <ul className="help-essentials">
            {essentials.map((article) => (
              <li key={article.href}>
                <Link href={article.href}>
                  <span>{article.title}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="page-width help-section" aria-labelledby="help-support">
        <div className="help-support-band">
          <Mail size={22} aria-hidden="true" />
          <div>
            <h2 id="help-support">Contact support</h2>
            {SUPPORT_EMAIL ? (
              <p>Email us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
            ) : (
              <p>For support, visit our <Link href="/contact">contact page</Link>.</p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
