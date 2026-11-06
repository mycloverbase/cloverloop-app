import Image from "next/image";
import type { CSSProperties } from "react";
import { ArrowUpRight, Mail } from "lucide-react";
import type { StorefrontCustomization, StorefrontSection, StorefrontTheme } from "@/lib/storefront/types";

type StorefrontView = {
  store_name: string;
  username: string;
  description: string;
  profileImageUrl: string | null;
  bannerImageUrl: string | null;
  theme: StorefrontTheme;
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
  const { products, productLayout } = store.customization;
  return (
    <section className="storefront-section storefront-products" id="products" aria-labelledby="storefront-products-title">
      <div className="storefront-section-heading">
        <div>
          <h2 id="storefront-products-title">Coming soon</h2>
        </div>
      </div>
      {products.length ? (
        <div className={`storefront-product-grid storefront-product-layout-${productLayout}`}>
          {products.map((product) => (
            <article className="storefront-product-card" key={product.id}>
              {product.coverImageUrl ? (
                <Image
                  src={product.coverImageUrl}
                  alt={`${product.title} cover`}
                  width={900}
                  height={675}
                  unoptimized
                  loading="lazy"
                />
              ) : (
                <div className="storefront-product-image-placeholder" aria-hidden="true" />
              )}
              <div className="storefront-product-copy">
                <span className="storefront-product-category">{product.category}</span>
                <h3>{product.title}</h3>
                {product.description ? <p>{product.description}</p> : null}
                <span className="storefront-coming-soon">Coming Soon</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="storefront-empty-products">Product previews will appear here when they are ready.</p>
      )}
    </section>
  );
}

function SocialSection({ store }: { store: StorefrontView }) {
  if (!store.customization.socialLinks.length) return null;
  return (
    <section className="storefront-section storefront-social" id="social" aria-labelledby="storefront-social-title">
      <span className="storefront-eyebrow">Around the web</span>
      <h2 id="storefront-social-title">Find me elsewhere</h2>
      <div className="storefront-social-links">
        {store.customization.socialLinks.map((link) => (
          <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer">
            <span>{link.label}</span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        ))}
      </div>
    </section>
  );
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

const sectionComponents: Record<StorefrontSection, (props: { store: StorefrontView }) => React.ReactNode> = {
  about: AboutSection,
  products: ProductsSection,
  social: SocialSection,
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
      {store.bannerImageUrl ? (
        <div className="storefront-banner">
          <Image
            src={store.bannerImageUrl}
            alt=""
            width={1800}
            height={600}
            unoptimized
            priority
            sizes="100vw"
          />
        </div>
      ) : null}

      <div className="storefront-content">
        <header className="storefront-hero">
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
          </div>
        </header>

        <div className="storefront-sections">
          {orderedSections.map((section) => {
            const Section = sectionComponents[section];
            return <Section key={section} store={store} />;
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
