import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FreeProductClaim } from "@/components/storefront/free-product-claim";
import { PaidProductCheckout } from "@/components/storefront/paid-product-checkout";
import { ProductDetailView } from "@/components/storefront/product-detail-view";
import {
  getPublishedStorefrontProduct,
} from "@/lib/storefront/server";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { getFreeProductConfig } from "@/lib/free-products/server";
import {
  getPublishedStorefrontRazorpayConnectionStatus,
  isRazorpayCheckoutEnabled,
  isRazorpayPartnerWebhookFulfillmentEnabled,
} from "@/lib/razorpay/checkout";
import { isRazorpayPurchaseEmailDeliveryConfigured } from "@/lib/razorpay/purchase-email";
import { PRODUCTION_URL } from "@/lib/site";
import { getPublishedProductReviews } from "@/lib/reviews/public";

type RouteParams = { slug: string; productId: string };

const loadPublishedProduct = cache(async (username: string, productId: string) => {
  const supabase = createSupabasePublicClient();
  return supabase
    ? getPublishedStorefrontProduct(supabase, username, productId)
    : null;
});

function jsonLd(value: Record<string, unknown>): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { slug, productId } = await params;
  const result = await loadPublishedProduct(slug, productId);
  if (!result) return { robots: { index: false, follow: false } };

  const { product, storefront } = result;
  const description = product.description.replace(/\s+/g, " ").trim().slice(0, 155) ||
    `${product.name}, a digital product from ${storefront.store_name}.`;
  const canonical = `${PRODUCTION_URL}/${encodeURIComponent(storefront.username)}/product/${product.id}`;
  const image = product.coverImageUrl
    ? new URL(product.coverImageUrl, PRODUCTION_URL).toString()
    : null;
  const title = `${product.name} by ${storefront.store_name} | CloverLoop`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
      siteName: "CloverLoop",
      ...(image ? { images: [{ url: image, alt: `${product.name} cover` }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function PublishedProductPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { slug, productId } = await params;
  const result = await loadPublishedProduct(slug, productId);
  if (!result) notFound();

  const { product, storefront } = result;
  const supabase = createSupabasePublicClient();
  const [creatorPaymentStatus, reviews] = await Promise.all([
    product.isFree
      ? Promise.resolve("connected" as const)
      : getPublishedStorefrontRazorpayConnectionStatus(storefront.username),
    supabase
      ? getPublishedProductReviews(supabase, product.id)
      : Promise.resolve({ summary: null, reviews: [] }),
  ]);
  const productUrl = `/${encodeURIComponent(storefront.username)}/product/${product.id}`;
  const storeUrl = `/${encodeURIComponent(storefront.username)}`;
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || null;
  const offer = {
    "@type": "Offer",
    priceCurrency: "INR",
    price: product.isFree ? "0.00" : (product.pricePaise / 100).toFixed(2),
    availability: "https://schema.org/InStock",
    url: `${PRODUCTION_URL}${productUrl}`,
  };
  const structuredProduct = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    category: product.category ?? undefined,
    image: product.coverImageUrl ? [product.coverImageUrl] : undefined,
    brand: { "@type": "Brand", name: storefront.store_name },
    offers: offer,
    ...(reviews.summary
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: reviews.summary.averageRating,
            reviewCount: reviews.summary.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };

  return (
    <ProductDetailView
      storefront={storefront}
      product={product}
      contactEmail={storefront.customization.publicEmail || supportEmail || "info@cloverloop.in"}
      reviews={reviews}
      head={
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(structuredProduct) }}
        />
      }
      purchase={product.isFree ? (
        <FreeProductClaim
          productId={product.id}
          productName={product.name}
          storefrontUsername={storefront.username}
          linkExpiryHours={getFreeProductConfig()?.linkExpiryHours ?? 48}
        />
      ) : (
        <PaidProductCheckout
          productId={product.id}
          storefrontUsername={storefront.username}
          storefrontName={storefront.store_name}
          productName={product.name}
          productDescription={product.description}
          storefrontUrl={storeUrl}
          supportEmail={supportEmail}
          pricePaise={product.pricePaise}
          creatorPaymentNotConfigured={creatorPaymentStatus === "not_connected"}
          enabled={
            isRazorpayCheckoutEnabled() &&
            isRazorpayPartnerWebhookFulfillmentEnabled() &&
            isRazorpayPurchaseEmailDeliveryConfigured() &&
            creatorPaymentStatus === "connected"
          }
        />
      )}
    />
  );
}
