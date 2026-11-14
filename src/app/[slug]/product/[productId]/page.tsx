import { cache, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicLayout } from "@/components/public-layout";
import { Breadcrumbs } from "@/components/site-header";
import { FreeProductClaim } from "@/components/storefront/free-product-claim";
import { PaidProductCheckout } from "@/components/storefront/paid-product-checkout";
import {
  getPublishedStorefrontProduct,
} from "@/lib/storefront/server";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { getFreeProductConfig } from "@/lib/free-products/server";
import {
  isRazorpayCheckoutEnabled,
  isRazorpayPartnerWebhookFulfillmentEnabled,
} from "@/lib/razorpay/checkout";
import { isRazorpayPurchaseEmailDeliveryConfigured } from "@/lib/razorpay/purchase-email";
import { PRODUCTION_URL } from "@/lib/site";

type RouteParams = { slug: string; productId: string };

const loadPublishedProduct = cache(async (username: string, productId: string) => {
  const supabase = createSupabasePublicClient();
  return supabase
    ? getPublishedStorefrontProduct(supabase, username, productId)
    : null;
});

function priceLabel(pricePaise: number, isFree: boolean): string {
  if (isFree) return "Free";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(pricePaise / 100);
}

function fileSizeLabel(size: number | null): string | null {
  if (size === null) return null;
  if (size < 1024) return `${size} bytes`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value)} ${units[unitIndex]}`;
}

function creatorInitials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "C";
}

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
  const productUrl = `/${encodeURIComponent(storefront.username)}/product/${product.id}`;
  const storeUrl = `/${encodeURIComponent(storefront.username)}`;
  const style = {
    "--store-primary": storefront.customization.primaryColor,
    "--store-accent": storefront.customization.accentColor,
    "--store-background": storefront.customization.backgroundColor,
  } as CSSProperties & {
    "--store-primary": string;
    "--store-accent": string;
    "--store-background": string;
  };
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
  };
  const productType = product.isFree ? "Lead Magnet" : "Digital Product";
  const formattedSize = fileSizeLabel(product.fileSize);
  const fileFormat = product.fileMimeType?.split("/").pop()?.toUpperCase() ??
    product.fileName?.split(".").pop()?.toUpperCase() ??
    null;

  return (
    <PublicLayout>
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: storefront.store_name, href: storeUrl },
          { label: product.name },
        ]}
      />
      <main
        className={`product-detail-page storefront-theme-${storefront.theme}`}
        style={style}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(structuredProduct) }}
        />
        <Link className="product-detail-back" href={storeUrl}>
          ← Back to {storefront.store_name}
        </Link>
        <div className="product-detail-grid">
          <div className="product-detail-main">
            <div className="product-detail-cover">
              {product.coverImageUrl ? (
                <Image
                  src={product.coverImageUrl}
                  alt={`${product.name} cover`}
                  fill
                  priority
                  sizes="(max-width: 760px) 100vw, 58vw"
                />
              ) : (
                <div className="product-detail-cover-placeholder" aria-hidden="true">
                  <span>{product.name.slice(0, 1).toUpperCase()}</span>
                </div>
              )}
            </div>
            <div className="product-detail-title-row">
              <div>
                {product.category ? <span className="storefront-product-category">{product.category}</span> : null}
                <h1>{product.name}</h1>
              </div>
              <span className="product-detail-type">{productType}</span>
            </div>
            <section className="product-detail-description" aria-labelledby="product-description-title">
              <h2 id="product-description-title">About this product</h2>
              <p>{product.description}</p>
            </section>
            {formattedSize || fileFormat ? (
              <dl className="product-detail-file-info">
                {fileFormat ? <div><dt>File format</dt><dd>{fileFormat}</dd></div> : null}
                {formattedSize ? <div><dt>File size</dt><dd>{formattedSize}</dd></div> : null}
              </dl>
            ) : null}
            <Link className="product-detail-creator" href={storeUrl}>
              {storefront.profileImageUrl ? (
                <Image
                  src={storefront.profileImageUrl}
                  alt=""
                  width={52}
                  height={52}
                  className="product-detail-avatar"
                />
              ) : (
                <span className="product-detail-avatar product-detail-avatar-fallback" aria-hidden="true">
                  {creatorInitials(storefront.store_name)}
                </span>
              )}
              <span>
                <small>Created by</small>
                <strong>{storefront.store_name}</strong>
                <small>@{storefront.username}</small>
              </span>
            </Link>
          </div>

          <aside className="product-detail-purchase" id="purchase" aria-label="Purchase this product">
            <span className="storefront-eyebrow">{productType}</span>
            <h2>{product.name}</h2>
            <p className="product-detail-price">{priceLabel(product.pricePaise, product.isFree)}</p>
            {product.isFree ? (
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
                enabled={
                  isRazorpayCheckoutEnabled() &&
                  isRazorpayPartnerWebhookFulfillmentEnabled() &&
                  isRazorpayPurchaseEmailDeliveryConfigured()
                }
              />
            )}
            <a className="product-detail-contact" href={`mailto:${storefront.customization.publicEmail || supportEmail || "info@cloverloop.in"}`}>
              Questions? Contact the creator
            </a>
          </aside>
        </div>
      </main>
    </PublicLayout>
  );
}
