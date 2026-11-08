import type { createSupabasePublicClient } from "@/lib/supabase/public";
import {
  type PublicStorefront,
  type PublicStorefrontDisplay,
  type CreatorStorefrontProduct,
  type StorefrontProductDisplay,
  type StorefrontCustomization,
  type StorefrontDisplay,
  type StorefrontRecord,
  type StorefrontTheme,
} from "@/lib/storefront/types";
import { parseStorefrontDraft } from "@/lib/storefront/validation";

type StorefrontSupabaseClient = NonNullable<ReturnType<typeof createSupabasePublicClient>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCustomization(value: unknown): StorefrontCustomization {
  const parsed = parseStorefrontDraft({
    storeName: "Store",
    username: "store",
    description: "",
    profileImagePath: null,
    bannerImagePath: null,
    theme: "minimal",
    customization: value,
  });
  if (!parsed.ok) throw new Error(`The storefront customization returned by Supabase is invalid: ${parsed.message}`);
  return parsed.value.customization;
}

function parseStorefront(value: unknown): StorefrontRecord | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.user_id !== "string" ||
    typeof value.store_name !== "string" ||
    typeof value.username !== "string" ||
    typeof value.description !== "string" ||
    typeof value.status !== "string"
  ) return null;

  if (
    !["minimal", "editorial", "bold"].includes(String(value.theme)) ||
    !["draft", "published", "unpublished", "deletion_pending"].includes(value.status)
  ) return null;
  const theme = value.theme as StorefrontTheme;
  const status = value.status as StorefrontRecord["status"];
  return {
    id: value.id,
    user_id: value.user_id,
    store_name: value.store_name,
    username: value.username,
    description: value.description,
    profile_image_path: typeof value.profile_image_path === "string" ? value.profile_image_path : null,
    banner_image_path: typeof value.banner_image_path === "string" ? value.banner_image_path : null,
    theme,
    customization: parseCustomization(value.customization),
    status,
    published_at: typeof value.published_at === "string" ? value.published_at : null,
    unpublished_at: typeof value.unpublished_at === "string" ? value.unpublished_at : null,
    deleted_at: typeof value.deleted_at === "string" ? value.deleted_at : null,
    delete_after: typeof value.delete_after === "string" ? value.delete_after : null,
    created_at: typeof value.created_at === "string" ? value.created_at : "",
    updated_at: typeof value.updated_at === "string" ? value.updated_at : "",
  };
}

function safeInteger(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseCreatorProduct(value: unknown): CreatorStorefrontProduct | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.storefront_id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.description !== "string" ||
    typeof value.is_free !== "boolean" ||
    typeof value.is_active !== "boolean" ||
    value.product_type !== "digital"
  ) return null;
  const pricePaise = safeInteger(value.price_paise);
  const fileSize = value.file_size === null ? null : safeInteger(value.file_size);
  if (
    pricePaise === null ||
    (value.file_size !== null && fileSize === null) ||
    (value.category !== null && typeof value.category !== "string")
  ) return null;
  return {
    id: value.id,
    storefrontId: value.storefront_id,
    name: value.name,
    description: value.description,
    category: typeof value.category === "string" ? value.category : null,
    productType: "digital",
    isFree: value.is_free,
    pricePaise,
    coverImagePath: typeof value.cover_image_path === "string" ? value.cover_image_path : null,
    coverImageUrl: null,
    isActive: value.is_active,
    fileName: typeof value.file_name === "string" ? value.file_name : null,
    fileSize,
    fileMimeType: typeof value.file_mime_type === "string" ? value.file_mime_type : null,
    firstListedAt: typeof value.first_listed_at === "string" ? value.first_listed_at : null,
    countedAsFree: value.counted_as_free === true,
    countedAsPaid: value.counted_as_paid === true,
    createdAt: typeof value.created_at === "string" ? value.created_at : "",
  };
}

function parsePublicProduct(value: unknown): StorefrontProductDisplay | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.description !== "string" ||
    typeof value.is_free !== "boolean" ||
    value.product_type !== "digital" ||
    (value.category !== null && typeof value.category !== "string")
  ) return null;
  const pricePaise = safeInteger(value.price_paise);
  if (pricePaise === null) return null;
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    category: typeof value.category === "string" ? value.category : null,
    productType: "digital",
    isFree: value.is_free,
    pricePaise,
    coverImageUrl: null,
  };
}

function storefrontImageUrl(
  supabase: StorefrontSupabaseClient,
  path: string | null,
): string | null {
  if (!path) return null;
  return supabase.storage.from("storefront-assets").getPublicUrl(path).data.publicUrl;
}

function addCustomizationImageUrls(
  supabase: StorefrontSupabaseClient,
  customization: StorefrontCustomization,
) {
  return {
    ...customization,
    products: customization.products.map((product) => ({
      ...product,
      coverImageUrl: storefrontImageUrl(supabase, product.coverImagePath),
    })),
  };
}

export async function getCreatorStorefront(
  supabase: StorefrontSupabaseClient,
  userId: string,
): Promise<StorefrontDisplay | null> {
  const { data, error } = await supabase
    .from("creator_storefronts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("Could not load the creator storefront.", error);
    throw new Error("Your storefront could not be loaded. Please try again.");
  }
  if (!data) return null;
  const storefront = parseStorefront(data);
  if (!storefront) throw new Error("The storefront data returned by Supabase is invalid.");
  const { data: productRows, error: productsError } = await supabase
    .from("storefront_products")
    .select("id,storefront_id,name,description,category,product_type,is_free,price_paise,is_active,cover_image_path,file_name,file_size,file_mime_type,first_listed_at,counted_as_free,counted_as_paid,created_at")
    .eq("storefront_id", storefront.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (productsError) {
    console.error("Could not load creator storefront products.", productsError);
    throw new Error("Your products could not be loaded. Please try again.");
  }
  const products = (productRows ?? []).map((row) => {
    const product = parseCreatorProduct(row);
    if (!product) throw new Error("The product data returned by Supabase is invalid.");
    return {
      ...product,
      coverImageUrl: storefrontImageUrl(supabase, product.coverImagePath),
    };
  });
  const profileImageUrl = storefrontImageUrl(supabase, storefront.profile_image_path);
  const bannerImageUrl = storefrontImageUrl(supabase, storefront.banner_image_path);
  const customization = addCustomizationImageUrls(supabase, { ...storefront.customization, products: [] });
  return { ...storefront, profileImageUrl, bannerImageUrl, products, customization };
}

export async function getPublishedStorefront(
  supabase: StorefrontSupabaseClient,
  username: string,
): Promise<PublicStorefrontDisplay | null> {
  const { data, error } = await supabase
    .from("published_storefronts")
    .select("store_name,username,description,profile_image_path,banner_image_path,theme,customization,published_at")
    .eq("username", username.toLowerCase())
    .maybeSingle();
  if (error) {
    console.error("Could not load the published storefront.", error);
    throw new Error("The storefront could not be loaded. Please try again.");
  }
  if (!data) return null;
  if (!isRecord(data) || typeof data.store_name !== "string" || typeof data.username !== "string") {
    throw new Error("The published storefront returned by Supabase is invalid.");
  }
  if (data.theme !== "minimal" && data.theme !== "editorial" && data.theme !== "bold") {
    throw new Error("The published storefront theme returned by Supabase is invalid.");
  }
  if (typeof data.published_at !== "string") {
    throw new Error("The published storefront timestamp returned by Supabase is invalid.");
  }
  const publicStorefront: PublicStorefront = {
    store_name: data.store_name,
    username: data.username,
    description: typeof data.description === "string" ? data.description : "",
    profile_image_path: typeof data.profile_image_path === "string" ? data.profile_image_path : null,
    banner_image_path: typeof data.banner_image_path === "string" ? data.banner_image_path : null,
    theme: data.theme,
    customization: {
      ...parseCustomization(data.customization),
      products: [],
    },
    published_at: data.published_at,
  };
  const { data: productRows, error: productsError } = await supabase
    .from("published_storefront_products")
    .select("id,name,description,category,product_type,is_free,price_paise,cover_image_path")
    .eq("username", publicStorefront.username)
    .order("name", { ascending: true });
  if (productsError) {
    console.error("Could not load published storefront products.", productsError);
    throw new Error("The storefront products could not be loaded. Please try again.");
  }
  const products = (productRows ?? []).map((row) => {
    const product = parsePublicProduct(row);
    if (!product) throw new Error("The published product data returned by Supabase is invalid.");
    const coverImagePath = isRecord(row) && typeof row.cover_image_path === "string" ? row.cover_image_path : null;
    return {
      ...product,
      coverImageUrl: storefrontImageUrl(supabase, coverImagePath),
    };
  });
  const profileImageUrl = storefrontImageUrl(supabase, publicStorefront.profile_image_path);
  const bannerImageUrl = storefrontImageUrl(supabase, publicStorefront.banner_image_path);
  const customization = addCustomizationImageUrls(supabase, { ...publicStorefront.customization, products: [] });
  return { ...publicStorefront, profileImageUrl, bannerImageUrl, products, customization };
}
