import type { Metadata } from "next";
import Script from "next/script";
import { ANALYTICS_CONSENT_KEY, SITE_NAME, PRODUCTION_URL, GTM_ID } from "@/lib/site";
import { AnalyticsConsent } from "@/components/analytics-consent";
import { AuthFlowTracker } from "@/components/auth-flow-tracker";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(PRODUCTION_URL),
  title: {
    default: "Sell Digital Products and Courses in India | CloverLoop",
    template: "%s",
  },
  description:
    "Explore CloverLoop's digital products and creator storefront, transparent plan pricing and practical resources for digital-product creators.",
  applicationName: SITE_NAME,
  alternates: { canonical: PRODUCTION_URL },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: PRODUCTION_URL,
    title: "Sell Digital Products and Courses in India | CloverLoop",
    description:
      "Explore CloverLoop's digital products and creator storefront, transparent plan pricing and practical resources for digital-product creators.",
    images: [{ url: "/images/home/hero.webp", width: 1376, height: 768, alt: "Illustrative CloverLoop creator storefront concept" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sell Digital Products and Courses in India | CloverLoop",
    description:
      "Explore CloverLoop's digital products and creator storefront, transparent plan pricing and practical resources for digital-product creators.",
    images: ["/images/home/hero.webp"],
  },
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "CloverLoop",
    url: PRODUCTION_URL,
    logo: `${PRODUCTION_URL}/images/brand/logo.png`,
  };
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "CloverLoop",
    url: PRODUCTION_URL,
    description:
      "Explore CloverLoop's creator storefront concept, transparent plan pricing and practical resources for digital-product creators.",
  };
  return (
    <html lang="en-IN">
      <head>
        <Script
          id="google-tag-manager-bootstrap"
          src="/scripts/google-tag-manager-bootstrap.js"
          strategy="beforeInteractive"
          data-gtm-id={GTM_ID}
          data-consent-key={ANALYTICS_CONSENT_KEY}
        />
      </head>
      <body>
        <AuthFlowTracker />
        <AnalyticsConsent />
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }} />
      </body>
    </html>
  );
}
