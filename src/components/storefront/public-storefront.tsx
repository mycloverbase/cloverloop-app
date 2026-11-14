import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import {
  Mail,
} from "lucide-react";
import { SocialPlatformIcon } from "@/components/storefront/social-platform-icon";
import type {
  StorefrontCustomization,
  StorefrontProductDisplay,
  StorefrontSection,
  StorefrontTheme,
} from "@/lib/storefront/types";

type StorefrontView = {
  store_name: string;
  username: string;
  description: string;
  profileImageUrl: string | null;
  bannerImageUrl: string | null;
  theme: StorefrontTheme;
  products: StorefrontProductDisplay[];
  customization: StorefrontCustomization & {
    products: (StorefrontCustomization["products"][number] & { coverImageUrl?: string | null })[];
  };
};

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "C";
}

function AboutSection({ store }: { store: StorefrontView }) {
  if (!store.description.trim()) return null;
  return (
    <section className="storefront-section storefront-about" id="about" aria-labelledby="storefront-about-title">
      <span className="storefront-eyebrow">A little about the creator</span>
      <h2 id="storefront-about-title">About</h2>
      <p>{store.description}</p>
    </section>
  );
}

function ProductsSection({ store }: { store: StorefrontView }) {
  return (
    <section className="storefront-section storefront-products" id="products" aria-labelledby="storefront-products-title">
      <div className="storefront-section-heading">
        <div>
          <h2 id="storefront-products-title">Products</h2>
        </div>
      </div>
      {store.products.length ? (
        <div className="storefront-product-grid">
          {store.products.map((product) => (
            <StorefrontProductCard
              key={product.id}
              product={product}
              storefrontUsername={store.username}
            />
          ))}
        </div>
      ) : (
        <p className="storefront-empty-products">No products are currently available.</p>
      )}
    </section>
  );
}

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
        {product.category ? <span className="storefront-product-category">{product.category}</span> : null}
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <div className="storefront-product-price-row">
          <strong>{price}</strong>
          <span>{product.isFree ? "Lead Magnet" : "Digital product"}</span>
        </div>
        {storefrontUsername ? (
          <Link
            className="storefront-product-action"
            href={`/${encodeURIComponent(storefrontUsername ?? "")}/product/${product.id}`}
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

function SocialIcon({ platform }: { platform: string }) {
  return <SocialPlatformIcon platform={platform} monochrome />;
}

function ContactSection({ store }: { store: StorefrontView }) {
  const email = store.customization.publicEmail.trim();
  if (!email) return null;
  return (
    <section className="storefront-section storefront-contact" id="contact" aria-labelledby="storefront-contact-title">
      <div>
        <span className="storefront-eyebrow">Get in touch</span>
        <h2 id="storefront-contact-title">Have a question?</h2>
      </div>
      <a className="storefront-contact-button" href={`mailto:${email}`}>
        <Mail size={17} aria-hidden="true" /> Contact
      </a>
    </section>
  );
}

const sectionComponents: Partial<Record<StorefrontSection, (props: { store: StorefrontView }) => React.ReactNode>> = {
  about: AboutSection,
  products: ProductsSection,
  contact: ContactSection,
};

export function PublicStorefront({ store }: { store: StorefrontView }) {
  const style = {
    "--store-primary": store.customization.primaryColor,
    "--store-accent": store.customization.accentColor,
    "--store-background": store.customization.backgroundColor,
  } as CSSProperties & {
    "--store-primary": string;
    "--store-accent": string;
    "--store-background": string;
  };
  const hidden = new Set(store.customization.hiddenSections);
  const orderedSections = store.customization.sectionOrder.filter((section) => !hidden.has(section));

  return (
    <main
      className={`storefront-shell storefront-theme-${store.theme} storefront-banner-${store.customization.bannerStyle}`}
      style={style}
    >
      <div className="storefront-content">
        <header className={`storefront-hero${store.bannerImageUrl ? " storefront-hero-has-banner" : ""}`}>
          {store.bannerImageUrl ? (
            <Image
              className="storefront-hero-banner"
              src={store.bannerImageUrl}
              alt=""
              fill
              unoptimized
              priority
              sizes="(max-width: 760px) 100vw, 1120px"
            />
          ) : null}
          {store.profileImageUrl ? (
            <Image
              className="storefront-profile-image"
              src={store.profileImageUrl}
              alt={`${store.store_name} profile`}
              width={176}
              height={176}
              unoptimized
              priority
            />
          ) : (
            <div className="storefront-profile-fallback" aria-hidden="true">{initials(store.store_name)}</div>
          )}
          <div className="storefront-hero-copy">
            <h1>{store.store_name}</h1>
            <p>@{store.username}</p>
            {!hidden.has("social") && store.customization.socialLinks.length ? (
              <nav className="storefront-social-icons" aria-label="Social links">
                {store.customization.socialLinks.map((link) => (
                  <a
                    key={link.id}
                    className="storefront-social-icon-link"
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={link.label}
                    title={link.label}
                  >
                    <SocialIcon platform={link.platform} />
                  </a>
                ))}
              </nav>
            ) : null}
          </div>
        </header>

        <div className="storefront-sections">
          {orderedSections.map((section) => {
            const Section = sectionComponents[section];
            return Section ? <Section key={section} store={store} /> : null;
          })}
        </div>

        <footer className="storefront-footer">
          <a href="https://cloverloop.in" rel="noopener noreferrer">
            Powered by CloverLoop
          </a>
        </footer>
      </div>
    </main>
  );
}
