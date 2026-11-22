import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import {
  Mail,
} from "lucide-react";
import { SocialPlatformIcon } from "@/components/storefront/social-platform-icon";
import { ProductCatalog } from "@/components/storefront/product-catalog";
import { StorefrontBio } from "@/components/storefront/storefront-bio";
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

type StorefrontHeaderView = Pick<
  StorefrontView,
  "store_name" | "username" | "description" | "profileImageUrl" | "bannerImageUrl" | "customization"
>;

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "C";
}

export function PublicStorefrontHeader({
  store,
  showDescription = true,
}: {
  store: StorefrontHeaderView;
  showDescription?: boolean;
}) {
  const hidden = new Set(store.customization.hiddenSections);
  return (
    <header className="storefront-profile-header">
      <div className={`storefront-profile-banner${store.bannerImageUrl ? " has-image" : ""}`}>
        {store.bannerImageUrl ? (
          <Image
            className="storefront-profile-banner-image"
            src={store.bannerImageUrl}
            alt=""
            fill
            unoptimized
            priority
            sizes="(max-width: 760px) 100vw, 1120px"
          />
        ) : null}
      </div>
      <div className="storefront-profile-layout">
        {store.profileImageUrl ? (
          <Image
            className="storefront-profile-avatar"
            src={store.profileImageUrl}
            alt={`${store.store_name} profile`}
            width={176}
            height={176}
            unoptimized
            priority
          />
        ) : (
          <div className="storefront-profile-avatar storefront-profile-avatar-fallback" aria-hidden="true">
            {initials(store.store_name)}
          </div>
        )}
        <div className="storefront-profile-copy">
          <div className="storefront-profile-name">
            <h1>{store.store_name}</h1>
            <p>@{store.username}</p>
          </div>
          {showDescription && !hidden.has("about") && store.description.trim() ? (
            <StorefrontBio description={store.description} />
          ) : null}
          {!hidden.has("social") && store.customization.socialLinks.length ? (
            <nav className="storefront-profile-socials" aria-label="Social links">
              {store.customization.socialLinks.map((link) => (
                <a
                  key={link.id}
                  className="storefront-profile-social-link"
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
      </div>
    </header>
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
        <ProductCatalog products={store.products} storefrontUsername={store.username} />
      ) : (
        <p className="storefront-empty-products">No products are currently available.</p>
      )}
    </section>
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
        <PublicStorefrontHeader store={store} showDescription={!hidden.has("about")} />

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
          <Link href="/signup">Start your own store</Link>
        </footer>
      </div>
    </main>
  );
}
