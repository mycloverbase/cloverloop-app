import Image from "next/image";
import Link from "next/link";
import type { StorefrontProductDisplay } from "@/lib/storefront/types";

export function StorefrontProductCard({
  product,
  storefrontUsername,
}: {
  product: StorefrontProductDisplay;
  storefrontUsername?: string;
}) {
  const price = product.isFree
    ? "No cost"
    : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(product.pricePaise / 100);
  const cardContent = (
    <>
      {product.coverImageUrl ? (
        <Image
          src={product.coverImageUrl}
          alt={`${product.name} cover`}
          width={900}
          height={675}
          unoptimized
          loading="lazy"
        />
      ) : (
        <div className="storefront-product-image-placeholder" aria-hidden="true" />
      )}
      <div className="storefront-product-copy">
        {product.category ? (
          <span className="storefront-product-category">
            {product.category}{product.subcategory ? ` · ${product.subcategory}` : ""}
          </span>
        ) : null}
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <div className="storefront-product-price-row">
          <strong>{price}</strong>
          <span>{product.isFree ? "Lead Magnet" : "Digital product"}</span>
        </div>
        {!storefrontUsername ? (
          product.isFree ? (
            <button className="storefront-product-action" type="button" disabled>
              Lead Magnet delivery coming soon
            </button>
          ) : (
            <span className="storefront-product-action" aria-disabled="true">
              Product unavailable
            </span>
          )
        ) : null}
      </div>
    </>
  );

  if (storefrontUsername) {
    return (
      <Link
        className="storefront-product-card"
        href={`/${encodeURIComponent(storefrontUsername)}/product/${product.id}`}
        id={`product-${product.id}`}
      >
        {cardContent}
      </Link>
    );
  }

  return (
    <article className="storefront-product-card" id={`product-${product.id}`}>
      {cardContent}
    </article>
  );
}
