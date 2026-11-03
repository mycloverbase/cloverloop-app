import type { Metadata } from "next";
import { ANALYTICS_CONSENT_KEY, SITE_NAME, PRODUCTION_URL, GTM_ID } from "@/lib/site";
import { AnalyticsConsent } from "@/components/analytics-consent";
import { AuthFlowTracker } from "@/components/auth-flow-tracker";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(PRODUCTION_URL),
  title: {
    default: "Sell Digital Products Online | CloverLoop",
    template: "%s",
  },
  description:
    "Create your own digital storefront, sell directly to your audience and simplify digital product delivery.",
  applicationName: SITE_NAME,
  alternates: { canonical: PRODUCTION_URL },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: PRODUCTION_URL,
    title: "Sell Digital Products Online | CloverLoop",
    description:
      "Create your own digital storefront, sell directly to your audience and simplify digital product delivery.",
    images: [{ url: "/images/home/hero.webp", width: 1376, height: 768, alt: "Illustrative CloverLoop creator storefront concept" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sell Digital Products Online | CloverLoop",
    description:
      "Create your own digital storefront, sell directly to your audience and simplify digital product delivery.",
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
      "Create your own digital storefront, sell directly to your audience and simplify digital product delivery.",
  };
  const googleTagManagerBootstrap = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){window.dataLayer.push(arguments);}
    window.gtag = gtag;
    gtag('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      wait_for_update: 500
    });
    try {
      if (window.localStorage.getItem('${ANALYTICS_CONSENT_KEY}') === 'accepted') {
        gtag('consent', 'update', { analytics_storage: 'granted' });
      }
    } catch (error) {
      console.warn('Unable to read analytics consent preference.', error);
    }
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    (function() {
      var script = document.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtm.js?id=${GTM_ID}';
      document.head.appendChild(script);
    })();
  `;
  return (
    <html lang="en-IN">
      <head>
        <script
          id="google-tag-manager-bootstrap"
          dangerouslySetInnerHTML={{ __html: googleTagManagerBootstrap }}
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
