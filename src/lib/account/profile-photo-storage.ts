import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function uploadCreatorAvatarStorefrontAsset(
  admin: SupabaseClient,
  avatarPath: string,
  image: Blob | Buffer,
): Promise<boolean> {
  const { error } = await admin.storage.from("storefront-assets").upload(avatarPath, image, {
    contentType: "image/webp",
    cacheControl: "3600",
    upsert: true,
  });
  if (!error) return true;
  console.error("Could not copy a creator avatar to public storefront storage.", error);
  return false;
}

export async function removeCreatorAvatarStorefrontAsset(
  admin: SupabaseClient,
  avatarPath: string | null,
): Promise<boolean> {
  if (!avatarPath) return true;
  const { error: storageError } = await admin.storage.from("storefront-assets").remove([avatarPath]);
  if (storageError) {
    console.error("Could not remove a superseded public creator avatar.", storageError);
    return false;
  }
  const { error: assetError } = await admin
    .from("storefront_assets")
    .delete()
    .eq("path", avatarPath);
  if (assetError) {
    console.error("Could not remove a superseded public creator avatar record.", assetError);
    return false;
  }
  return true;
}

export async function removeCreatorAvatar(
  admin: SupabaseClient,
  avatarPath: string | null,
): Promise<boolean> {
  if (!avatarPath) return true;
  const { error } = await admin.storage.from("creator-avatars").remove([avatarPath]);
  if (error) console.error("Could not remove a superseded creator avatar.", error);
  const storefrontAssetRemoved = await removeCreatorAvatarStorefrontAsset(admin, avatarPath);
  return !error && storefrontAssetRemoved;
}

export async function removeStorefrontAsset(
  admin: SupabaseClient,
  userId: string,
  storefrontId: string,
  imagePath: string,
): Promise<void> {
  const { error: storageError } = await admin.storage.from("storefront-assets").remove([imagePath]);
  if (storageError) console.error("Could not remove an unsaved storefront image.", storageError);

  const { error: assetError } = await admin
    .from("storefront_assets")
    .delete()
    .eq("user_id", userId)
    .eq("storefront_id", storefrontId)
    .eq("path", imagePath);
  if (assetError) console.error("Could not remove an unsaved storefront image record.", assetError);
}
