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
  return (
    <article className="storefront-product-card" id={`product-${product.id}`}>
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
        {storefrontUsername ? (
          <Link
            className="storefront-product-action"
            href={`/${encodeURIComponent(storefrontUsername)}/product/${product.id}`}
          >
            View Product
          </Link>
        ) : product.isFree ? (
          <button className="storefront-product-action" type="button" disabled>
            Lead Magnet delivery coming soon
          </button>
        ) : (
          <span className="storefront-product-action" aria-disabled="true">
            Product unavailable
          </span>
        )}
      </div>
    </article>
  );
}
