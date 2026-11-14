export type StorefrontTheme = "minimal" | "editorial" | "bold";
export type StorefrontSection = "about" | "products" | "social" | "contact";
export type StorefrontImageKind = "profile" | "banner" | "product";

export type StorefrontSocialLink = {
  id: string;
  platform: string;
  label: string;
  url: string;
};

export type StorefrontProductCard = {
  id: string;
  title: string;
  description: string;
  category: string;
  coverImagePath: string;
  coverImageUrl?: string | null;
};

export type StorefrontProductDisplay = {
  id: string;
  name: string;
  description: string;
  category: string | null;
  productType: "digital";
  isFree: boolean;
  pricePaise: number;
  coverImageUrl: string | null;
};

export type PublishedStorefrontProduct = StorefrontProductDisplay & {
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
};

export type CreatorStorefrontProduct = StorefrontProductDisplay & {
  storefrontId: string;
  coverImagePath: string | null;
  isActive: boolean;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
  firstListedAt: string | null;
  countedAsFree: boolean;
  countedAsPaid: boolean;
  createdAt: string;
};

export type StorefrontCustomization = {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  productLayout: "grid" | "list";
  bannerStyle: "wide" | "compact";
  sectionOrder: StorefrontSection[];
  hiddenSections: StorefrontSection[];
  products: StorefrontProductCard[];
  socialLinks: StorefrontSocialLink[];
  publicEmail: string;
};

export type StorefrontRecord = {
  id: string;
  user_id: string;
  store_name: string;
  username: string;
  description: string;
  profile_image_path: string | null;
  banner_image_path: string | null;
  theme: StorefrontTheme;
  customization: StorefrontCustomization;
  status: "draft" | "published" | "unpublished" | "deletion_pending";
  published_at: string | null;
  unpublished_at: string | null;
  deleted_at: string | null;
  delete_after: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicStorefront = Omit<
  StorefrontRecord,
  "id" | "user_id" | "status" | "unpublished_at" | "deleted_at" | "delete_after" | "created_at" | "updated_at"
> & {
  published_at: string;
};

export type StorefrontDisplay = StorefrontRecord & {
  profileImageUrl: string | null;
  bannerImageUrl: string | null;
  products: CreatorStorefrontProduct[];
  customization: StorefrontCustomization & {
    products: (StorefrontCustomization["products"][number] & { coverImageUrl: string | null })[];
  };
};

export type PublicStorefrontDisplay = PublicStorefront & {
  profileImageUrl: string | null;
  bannerImageUrl: string | null;
  products: StorefrontProductDisplay[];
  customization: StorefrontCustomization & {
    products: (StorefrontCustomization["products"][number] & { coverImageUrl: string | null })[];
  };
};

export type StorefrontDraftInput = {
  storeName: string;
  username: string;
  description: string;
  profileImagePath: string | null;
  bannerImagePath: string | null;
  theme: StorefrontTheme;
  customization: StorefrontCustomization;
};

export type StorefrontActionResult =
  | { ok: true; message: string; url?: string; path?: string; imageUrl?: string; storefrontId?: string; deleteAfter?: string }
  | { ok: false; message: string };

export const DEFAULT_STOREFRONT_CUSTOMIZATION: StorefrontCustomization = {
  primaryColor: "#2f7254",
  accentColor: "#a8c9a5",
  backgroundColor: "#ffffff",
  productLayout: "grid",
  bannerStyle: "wide",
  sectionOrder: ["about", "products", "social", "contact"],
  hiddenSections: [],
  products: [],
  socialLinks: [],
  publicEmail: "",
};

export const STOREFRONT_SECTIONS: { id: StorefrontSection; label: string }[] = [
  { id: "about", label: "About" },
  { id: "products", label: "Product showcase" },
  { id: "social", label: "Social links" },
  { id: "contact", label: "Contact information" },
];

export const STOREFRONT_SOCIAL_PLATFORMS = [
  "Instagram",
  "YouTube",
  "Facebook",
  "LinkedIn",
  "X",
  "TikTok",
  "Pinterest",
  "Threads",
  "Twitch",
  "Other",
] as const;

export const STOREFRONT_PRODUCT_CATEGORIES = [
  "Education",
  "Templates",
  "Design",
  "Business",
  "Creative",
  "Other",
] as const;

export function storefrontUsernameFromName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 30);
}
