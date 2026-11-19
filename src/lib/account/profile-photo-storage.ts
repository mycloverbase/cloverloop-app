import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function removeCreatorAvatar(
  admin: SupabaseClient,
  avatarPath: string | null,
): Promise<boolean> {
  if (!avatarPath) return true;
  const { error } = await admin.storage.from("creator-avatars").remove([avatarPath]);
  if (!error) return true;
  console.error("Could not remove a superseded creator avatar.", error);
  return false;
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
