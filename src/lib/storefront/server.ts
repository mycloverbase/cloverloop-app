import type { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  type PublicStorefront,
  type PublicStorefrontDisplay,
  type StorefrontCustomization,
  type StorefrontDisplay,
  type StorefrontRecord,
  type StorefrontTheme,
} from "@/lib/storefront/types";
import { parseStorefrontDraft } from "@/lib/storefront/validation";

type StorefrontSupabaseClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

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

async function signedImageUrl(
  supabase: StorefrontSupabaseClient,
  path: string | null,
  expiresIn = 60 * 60,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("storefront-assets")
    .createSignedUrl(path, expiresIn);
  if (error) {
    console.error("Could not create a storefront image URL.", error);
    return null;
  }
  return data.signedUrl;
}

async function signCustomization(
  supabase: StorefrontSupabaseClient,
  customization: StorefrontCustomization,
) {
  return {
    ...customization,
    products: await Promise.all(customization.products.map(async (product) => ({
      ...product,
      coverImageUrl: await signedImageUrl(supabase, product.coverImagePath),
    }))),
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
  const [profileImageUrl, bannerImageUrl, customization] = await Promise.all([
    signedImageUrl(supabase, storefront.profile_image_path, 60 * 60 * 12),
    signedImageUrl(supabase, storefront.banner_image_path, 60 * 60 * 12),
    signCustomization(supabase, storefront.customization),
  ]);
  return { ...storefront, profileImageUrl, bannerImageUrl, customization };
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
    customization: parseCustomization(data.customization),
    published_at: data.published_at,
  };
  const [profileImageUrl, bannerImageUrl, customization] = await Promise.all([
    signedImageUrl(supabase, publicStorefront.profile_image_path),
    signedImageUrl(supabase, publicStorefront.banner_image_path),
    signCustomization(supabase, publicStorefront.customization),
  ]);
  return { ...publicStorefront, profileImageUrl, bannerImageUrl, customization };
}
