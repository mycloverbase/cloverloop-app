import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import sharp from "sharp";
import { PublicStorefront, type StorefrontView } from "@/components/storefront/public-storefront";
import { ProductDetailView } from "@/components/storefront/product-detail-view";
import { DEFAULT_STOREFRONT_CUSTOMIZATION, type StorefrontTheme } from "@/lib/storefront/types";

export const metadata = {
  title: "Storefront theme preview | CloverLoop",
  robots: { index: false, follow: false },
};

const palettes = {
  default: { primaryColor: "#2f7254", accentColor: "#a8c9a5", backgroundColor: "#ffffff" },
  plum: { primaryColor: "#5b2a6e", accentColor: "#d9c2e6", backgroundColor: "#fbf8fc" },
  clay: { primaryColor: "#9a4a2f", accentColor: "#efc9a8", backgroundColor: "#fffaf5" },
  ink: { primaryColor: "#1f2a44", accentColor: "#b9c6e4", backgroundColor: "#ffffff" },
  mono: { primaryColor: "#151515", accentColor: "#c9c9c9", backgroundColor: "#ececec" },
} as const;

const products = [
  {
    id: "p1", name: "Sketch Daily: 30-Day Drawing Workbook", category: "Education & Learning", subcategory: "Worksheets",
    description: "A guided 48-page workbook with one short drawing exercise a day, warm-ups and reflection prompts.",
    isFree: false, pricePaise: 49900, coverImageUrl: "/images/resources/how-to-write-an-ebook.webp",
  },
  {
    id: "p2", name: "Monsoon Light Lightroom Presets", category: "Design & Creativity", subcategory: "Presets",
    description: "Twelve soft, natural presets for mobile and desktop, tuned for Indian light and skin tones.",
    isFree: false, pricePaise: 29900, coverImageUrl: "/images/resources/how-to-sell-presets.webp",
  },
  {
    id: "p3", name: "Brand Kit Templates", category: "Design & Creativity", subcategory: "Templates",
    description: "Twenty-four editable layouts for social posts, highlights and a one-page media kit.",
    isFree: false, pricePaise: 79900, coverImageUrl: "/images/resources/how-to-sell-canva-templates.webp",
  },
  {
    id: "p4", name: "Weekly Creative Planner", category: "Productivity", subcategory: "Planners",
    description: "A printable weekly planner for sketch goals, client work and content ideas.",
    isFree: true, pricePaise: 0, coverImageUrl: "/images/resources/how-to-sell-printables.webp",
  },
  {
    id: "p5", name: "Colour Theory Mini Course Notes", category: "Education & Learning", subcategory: "Study Notes",
    description: "Illustrated notes from my colour theory sessions, with palettes and practice sheets.",
    isFree: false, pricePaise: 19900, coverImageUrl: null,
  },
  {
    id: "p6", name: "Ink & Wash Brush Pack", category: "Design & Creativity", subcategory: "Design Assets",
    description: "Forty textured brushes for Procreate and Photoshop, made from real ink and wash scans.",
    isFree: false, pricePaise: 34900, coverImageUrl: "/images/resources/digital-products.webp",
  },
].map((product) => ({ ...product, productType: "digital" as const }));

async function sampleAvatar() {
  const source = await readFile(path.join(process.cwd(), "public/images/home/creator-community.webp"));
  const buffer = await sharp(source).extract({ left: 560, top: 190, width: 200, height: 200 }).resize(320, 320).webp().toBuffer();
  return `data:image/webp;base64,${buffer.toString("base64")}`;
}

export default async function StorefrontThemePreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const theme = (["minimal", "editorial", "bold"].includes(query.theme ?? "") ? query.theme : "minimal") as StorefrontTheme;
  const palette = palettes[(query.palette ?? "default") as keyof typeof palettes] ?? palettes.default;
  const withAvatar = query.avatar !== "none";
  const productList = query.products === "none" ? [] : products;

  const store: StorefrontView = {
    store_name: "Aanya Mehra",
    username: "aanya",
    description:
      "Illustrator and art educator from Pune. I make practical workbooks, presets and templates that help you draw, paint and share your work with more confidence.\n\nNew drops every month.",
    profileImageUrl: withAvatar ? await sampleAvatar() : null,
    bannerImageUrl: query.banner === "custom" ? "/images/home/creator-community.webp" : null,
    theme,
    products: productList,
    customization: {
      ...DEFAULT_STOREFRONT_CUSTOMIZATION,
      ...palette,
      socialLinks: [
        { id: "s1", platform: "Instagram", label: "Instagram", url: "https://instagram.com" },
        { id: "s2", platform: "YouTube", label: "YouTube", url: "https://youtube.com" },
        { id: "s3", platform: "LinkedIn", label: "LinkedIn", url: "https://linkedin.com" },
      ],
      publicEmail: "hello@example.com",
    },
  };

  if (query.view === "product") {
    const product = productList[0] ?? products[0];
    const sampleReviews = [
      ["Priya S.", 5, "Exactly what I needed to get back into a daily drawing habit. The prompts are short enough to finish before work, and the reflection pages kept me honest."],
      ["Rohan K.", 4, "Clear, well-designed and practical. I would love a second volume with more figure drawing."],
      ["Meera", 5, ""],
      ["Verified buyer", 3, "Good exercises, though I expected a few more pages on shading."],
    ] as const;
    const reviews = query.reviews === "none"
      ? { summary: null, reviews: [] }
      : {
          summary: { reviewCount: 4, averageRating: 4.3, distribution: { 5: 2, 4: 1, 3: 1, 2: 0, 1: 0 } },
          reviews: sampleReviews.map(([reviewerName, rating, body], index) => ({
            id: `r${index}`,
            reviewerName,
            rating,
            body,
            submittedAt: new Date(Date.UTC(2026, 10, 20 - index * 3)).toISOString(),
            verifiedPurchase: true,
          })),
        };
    return (
      <ProductDetailView
        storefront={store}
        product={{ ...product, fileName: "sketch-daily.pdf", fileSize: 8_400_000, fileMimeType: "application/pdf" }}
        contactEmail="hello@example.com"
        reviews={reviews}
        purchase={
          <div className="storefront-product-checkout">
            <button type="button" className="storefront-product-action">Buy now</button>
          </div>
        }
      />
    );
  }

  return <PublicStorefront store={store} />;
}
