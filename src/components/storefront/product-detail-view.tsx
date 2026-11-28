import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { PublicStorefrontHeader, StorefrontFooter, type StorefrontView } from "@/components/storefront/public-storefront";
import { ProductRatingBadge, ProductReviews, type ProductReviewData } from "@/components/reviews/product-reviews";
import type { StorefrontProductDisplay } from "@/lib/storefront/types";

type ProductDetailProduct = StorefrontProductDisplay & {
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
};

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

export function ProductDetailView({
  storefront,
  product,
  purchase,
  contactEmail,
  head,
  reviews,
}: {
  storefront: Omit<StorefrontView, "products">;
  product: ProductDetailProduct;
  purchase: ReactNode;
  contactEmail: string;
  head?: ReactNode;
  reviews?: ProductReviewData;
}) {
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
  const productType = product.isFree ? "Lead Magnet" : "Digital Product";
  const formattedSize = fileSizeLabel(product.fileSize);
  const fileFormat = product.fileMimeType?.split("/").pop()?.toUpperCase() ??
    product.fileName?.split(".").pop()?.toUpperCase() ??
    null;

  return (
    <main
      className={`storefront-shell storefront-theme-${storefront.theme} storefront-banner-${storefront.customization.bannerStyle}`}
      style={style}
    >
      <div className="storefront-content">
        <PublicStorefrontHeader store={storefront} compact />
        <section className="product-detail-page">
          {head}
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
                  {reviews ? <ProductRatingBadge summary={reviews.summary} /> : null}
                </div>
                <span className="product-detail-type">{productType}</span>
              </div>
              <section className="product-detail-description" aria-labelledby="product-description-title">
                <h2 id="product-description-title">About this product</h2>
                <p>{product.description}</p>
              </section>
              {formattedSize || fileFormat ? (
                <section className="product-detail-specifications" aria-labelledby="product-specifications-title">
                  <h2 id="product-specifications-title">File details</h2>
                  <dl className="product-detail-file-info">
                    {fileFormat ? <div><dt>File format</dt><dd>{fileFormat}</dd></div> : null}
                    {formattedSize ? <div><dt>File size</dt><dd>{formattedSize}</dd></div> : null}
                  </dl>
                </section>
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
              {reviews ? <ProductReviews data={reviews} /> : null}
            </div>

            <aside className="product-detail-purchase" id="purchase" aria-label="Purchase this product">
              <span className="storefront-eyebrow">{productType}</span>
              <h2>{product.name}</h2>
              <p className="product-detail-price">{priceLabel(product.pricePaise, product.isFree)}</p>
              {purchase}
              <a className="product-detail-contact" href={`mailto:${contactEmail}`}>
                Questions? Contact the creator
              </a>
            </aside>
          </div>
        </section>
        <StorefrontFooter showSignupLink={false} />
      </div>
    </main>
  );
}
