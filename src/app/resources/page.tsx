import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { PublicLayout } from "@/components/public-layout";
import { PublicCta } from "@/components/public-cta";
import { TrackLink } from "@/components/track-link";
import { resourceCards, PRODUCTION_URL } from "@/lib/site";
import { getGuide, getGuideSlugs } from "@/lib/guides";

const creatorGuides = getGuideSlugs().flatMap((slug) => {
  const article = getGuide(slug);
  return article ? [article] : [];
});

export const metadata: Metadata = {
  title: "Creator Resource Hub: Guides and Tools",
  description: "Explore practical guides and tools for creating, marketing and selling digital products online.",
  alternates: { canonical: `${PRODUCTION_URL}/resources` },
  openGraph: {
    title: "Creator Resource Hub: Guides and Tools",
    description: "Explore practical guides and tools for creating, marketing and selling digital products online.",
    url: `${PRODUCTION_URL}/resources`,
    images: ["/images/resources/resource-hub.webp"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Creator Resource Hub: Guides and Tools",
    description: "Explore practical guides and tools for creating, marketing and selling digital products online.",
    images: ["/images/resources/resource-hub.webp"],
  },
};

const groups = [
  { title: "Creating digital products and courses", slugs: ["how-to-write-an-ebook", "digital-products", "how-to-sell-digital-products-online", "how-to-sell-templates-online", "online-course-ideas", "homemade-online-course-ideas", "how-to-create-and-sell-online-course-india"] },
  { title: "Selling digital products", slugs: ["best-platform-to-sell-digital-products-india-2026", "how-to-sell-ebooks", "how-to-sell-presets", "how-to-sell-printables", "how-to-sell-canva-templates", "accept-upi-payments-digital-products-razorpay"] },
  { title: "Pricing, planning and tax", slugs: ["how-to-price-digital-products", "how-many-sales-to-hit-your-income-goal", "do-you-need-gst-registration-to-sell-online", "gst-on-ebooks-and-online-courses-india"] },
  { title: "Growing as a creator", slugs: ["content-creator", "marketing-ideas-tool"] },
];

export default function ResourcesPage() {
  return (
    <PublicLayout>
      <section className="resource-hub-hero page-width">
        <div>
          <span className="eyebrow">Creator Resource Hub</span>
          <h1>Practical ideas for creating and selling digital products</h1>
          <p>
            Build your digital product business with practical guides, ideas and
            tools. Whether you are planning your first ebook, creating presets,
            designing templates or exploring new product opportunities, use
            these resources to understand the process and make informed decisions.
          </p>
          <TrackLink href="/signup" event="signup_click" className="button">Get Started for Free <ArrowRight size={16} /></TrackLink>
        </div>
        <Image src="/images/resources/resource-hub.webp" alt="Guides and ideas in the CloverLoop Resource Hub" width={1376} height={768} priority sizes="(max-width: 760px) 100vw, 48vw" />
      </section>
      <section className="section-space page-width resource-groups">
        {groups.map((group) => (
          <div className="resource-group" key={group.title}>
            <div className="resource-group-heading"><span className="eyebrow">Resource collection</span><h2>{group.title}</h2></div>
            <div className="resource-card-grid">
              {group.slugs.map((slug) => {
                const resource = resourceCards.find((item) => item.slug === slug);
                if (!resource) return null;
                return (
                  <Link href={`/resources/${resource.slug}`} className="resource-card" key={resource.slug}>
                    <div className="resource-card-image">
                      <Image src={resource.image} alt={resource.title} width={1376} height={768} sizes="(max-width: 700px) 100vw, 30vw" />
                    </div>
                    <span className="eyebrow">{resource.category}</span>
                    <h3>{resource.title}</h3>
                    <p>{resource.description}</p>
                    <span className="resource-card-link">Explore resource <ArrowRight size={15} /></span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </section>
      <section className="section-space page-width resource-groups">
        <div className="resource-group">
          <div className="resource-group-heading"><span className="eyebrow">India-focused guides</span><h2>Practical guides for Indian creators</h2></div>
          <div className="resource-card-grid">
            {creatorGuides.map((guide) => (
              <Link href={`/guides/${guide.slug}`} className="resource-card" key={guide.slug}>
                <div className="resource-card-image">
                  <Image src={guide.image} alt={guide.imageAlt} width={1376} height={768} sizes="(max-width: 700px) 100vw, 30vw" />
                </div>
                <span className="eyebrow">{guide.category}</span>
                <h3>{guide.title}</h3>
                <p>{guide.description}</p>
                <span className="resource-card-link">Explore guide <ArrowRight size={15} /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <PublicCta title="Ready to give your products a home?" />
    </PublicLayout>
  );
}
