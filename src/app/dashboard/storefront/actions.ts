"use server";

import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { creatorAgreementIsAccepted } from "@/lib/account/creator-agreement-consent";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { removeCreatorAvatar } from "@/lib/account/profile-photo-storage";
import type { StorefrontActionResult } from "@/lib/storefront/types";
import { parseStorefrontDraft, safeImageCrop } from "@/lib/storefront/validation";

type StorefrontAuth =
  | {
      ok: true;
      supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
      userId: string;
    }
  | { ok: false; result: StorefrontActionResult };

async function getStorefrontAuth(): Promise<StorefrontAuth> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, result: { ok: false, message: "Storefront services are not configured." } };
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    if (error) console.error("Could not verify a storefront action.", error);
    return { ok: false, result: { ok: false, message: "Please sign in again to continue." } };
  }
  if (!(await creatorAgreementIsAccepted(supabase))) {
    return {
      ok: false,
      result: { ok: false, message: "Accept the Creator Agreement before managing your storefront." },
    };
  }
  return { ok: true, supabase, userId: user.id };
}

function databaseMessage(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "That username is already taken. Choose another username.";
  if (error.message?.includes("reserved")) return "That username is reserved. Choose another username.";
  if (error.message?.includes("deletion period")) {
    return "This storefront is scheduled for permanent deletion and can no longer be changed.";
  }
  if (error.message?.includes("profile image")) {
    return "Add and save a profile image before publishing your storefront.";
  }
  if (error.code === "23514") return "Some storefront details are invalid. Review the form and try again.";
  console.error("A storefront database action failed.", error);
  return "Your storefront could not be updated. Please try again.";
}

function isCreatorAvatarPath(path: string | null, userId: string): path is string {
  return path !== null &&
    path.startsWith(`${userId}/`) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i
      .test(path.slice(userId.length + 1));
}

function revalidateStorefrontRoutes(previousUsername: string | null, username: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard/storefront");
  if (previousUsername) revalidatePath(`/${previousUsername}`);
  revalidatePath(`/${username}`);
}

export async function checkStorefrontUsernameAction(username: string): Promise<StorefrontActionResult> {
  const normalized = typeof username === "string" ? username.trim().toLowerCase() : "";
  if (!/^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/.test(normalized)) {
    return { ok: false, message: "Use 3–30 letters, numbers, hyphens or underscores for your username." };
  }
  const auth = await getStorefrontAuth();
  if (!auth.ok) return auth.result;
  const { data, error } = await auth.supabase.rpc("storefront_username_available", {
    requested_username: normalized,
  });
  if (error) {
    console.error("Could not check storefront username availability.", error);
    return { ok: false, message: "Username availability could not be checked. Please try again." };
  }
  if (data !== true) {
    return { ok: false, message: "That username is unavailable or reserved. Choose another name." };
  }
  return { ok: true, message: "That username is available." };
}

export async function saveStorefrontAction(input: unknown): Promise<StorefrontActionResult> {
  const parsed = parseStorefrontDraft(input);
  if (!parsed.ok) return parsed;
  const auth = await getStorefrontAuth();
  if (!auth.ok) return auth.result;
  let storefront = parsed.value;
  const { data: previousStorefront, error: previousStorefrontError } = await auth.supabase
    .from("creator_storefronts")
    .select("id,username,status,profile_image_path")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (previousStorefrontError) {
    console.error("Could not load the previous storefront for photo synchronization.", previousStorefrontError);
    return { ok: false, message: "Your storefront could not be updated. Please try again." };
  }
  const { data: profile, error: profileError } = await auth.supabase
    .from("creator_profiles")
    .select("avatar_path")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile) {
    if (profileError) console.error("Could not load the creator photo for storefront synchronization.", profileError);
    return { ok: false, message: "Your profile photo could not be synchronized. Reload and try again." };
  }
  if (previousStorefront?.status === "deletion_pending") {
    return { ok: false, message: "This storefront is scheduled for permanent deletion and can no longer be changed." };
  }

  let avatarPathToSave = profile.avatar_path;
  let imagePathToSave = storefront.profileImagePath;
  if (
    imagePathToSave &&
    !isCreatorAvatarPath(imagePathToSave, auth.userId) &&
    imagePathToSave === previousStorefront?.profile_image_path &&
    profile.avatar_path
  ) {
    imagePathToSave = profile.avatar_path;
    storefront = { ...storefront, profileImagePath: imagePathToSave };
  }
  if (!imagePathToSave && !previousStorefront?.profile_image_path && profile.avatar_path) {
    imagePathToSave = profile.avatar_path;
    storefront = { ...storefront, profileImagePath: imagePathToSave };
  }
  if (isCreatorAvatarPath(imagePathToSave, auth.userId)) {
    avatarPathToSave = imagePathToSave;
  } else if (!imagePathToSave && previousStorefront?.profile_image_path) {
    avatarPathToSave = null;
  }

  const needsAvatarCleanup =
    profile.avatar_path !== null && profile.avatar_path !== avatarPathToSave;
  const storageAdmin = needsAvatarCleanup ? createSupabaseAdminClient() : null;
  if (needsAvatarCleanup && !storageAdmin) {
    return { ok: false, message: "Profile-photo synchronization is not configured. Please contact support." };
  }

  let savedStorefrontId: string | null = null;

  try {
    let imageUrl: string | undefined;
    if (imagePathToSave) {
      if (isCreatorAvatarPath(imagePathToSave, auth.userId)) {
        const { data: signedImage, error: signedImageError } = await auth.supabase.storage
          .from("creator-avatars")
          .createSignedUrl(imagePathToSave, 60 * 60 * 12);
        if (signedImageError || !signedImage?.signedUrl) {
          console.error("Could not prepare the shared creator profile photo.", signedImageError);
          return { ok: false, message: "The profile image could not be prepared. Please try again." };
        }
        imageUrl = signedImage.signedUrl;
      } else {
        imageUrl = auth.supabase.storage
          .from("storefront-assets")
          .getPublicUrl(imagePathToSave).data.publicUrl;
      }
    }

    const { data, error } = await auth.supabase.rpc("save_my_storefront_with_avatar", {
      requested_store_name: storefront.storeName,
      requested_username: storefront.username,
      requested_description: storefront.description,
      requested_profile_image_path: imagePathToSave,
      requested_banner_image_path: storefront.bannerImagePath,
      requested_theme: storefront.theme,
      requested_customization: storefront.customization,
      requested_avatar_path: avatarPathToSave,
    });
    if (error) {
      return { ok: false, message: databaseMessage(error) };
    }
    savedStorefrontId = typeof data === "string" ? data : null;

    let cleanupWarning = false;
    if (needsAvatarCleanup && storageAdmin) {
      cleanupWarning = !(await removeCreatorAvatar(storageAdmin, profile.avatar_path));
    }
    revalidateStorefrontRoutes(previousStorefront?.username ?? null, storefront.username);
    return {
      ok: true,
      message: cleanupWarning
        ? "Storefront changes and photo synchronization were saved, but the previous private profile image could not be deleted."
        : "Storefront changes saved.",
      ...(savedStorefrontId ? { storefrontId: savedStorefrontId } : {}),
      ...(imagePathToSave !== parsed.value.profileImagePath && imagePathToSave
        ? { path: imagePathToSave, imageUrl }
        : {}),
    };
  } catch (syncError) {
    console.error("Could not synchronize the creator and storefront profile photos.", syncError);
    if (savedStorefrontId && !previousStorefront) {
      revalidateStorefrontRoutes(null, storefront.username);
    }
    return {
      ok: false,
      message: syncError instanceof Error
        ? syncError.message
        : "Your profile photo could not be synchronized. Please try again.",
    };
  }
}

export async function publishStorefrontAction(): Promise<StorefrontActionResult> {
  const auth = await getStorefrontAuth();
  if (!auth.ok) return auth.result;
  const { data, error: loadError } = await auth.supabase
    .from("creator_storefronts")
    .select("username")
    .eq("user_id", auth.userId)
    .single();
  if (loadError || !data?.username) {
    if (loadError) console.error("Could not load the published storefront URL.", loadError);
    return { ok: false, message: "Your storefront URL could not be loaded. Refresh the page and try again." };
  }
  const { error } = await auth.supabase.rpc("publish_my_storefront");
  if (error) return { ok: false, message: databaseMessage(error) };
  revalidatePath(`/${data.username}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/storefront");
  return {
    ok: true,
    message: "Your storefront is live.",
    url: `https://cloverloop.in/${data.username}`,
  };
}

export async function unpublishStorefrontAction(): Promise<StorefrontActionResult> {
  const auth = await getStorefrontAuth();
  if (!auth.ok) return auth.result;
  const { error } = await auth.supabase.rpc("unpublish_my_storefront");
  if (error) return { ok: false, message: databaseMessage(error) };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/storefront");
  return { ok: true, message: "Your storefront is unpublished. Its public URL now returns 404." };
}

export async function deleteStorefrontAction(): Promise<StorefrontActionResult> {
  const auth = await getStorefrontAuth();
  if (!auth.ok) return auth.result;
  const { error } = await auth.supabase.rpc("delete_my_storefront");
  if (error) return { ok: false, message: databaseMessage(error) };
  const { data, error: loadError } = await auth.supabase
    .from("creator_storefronts")
    .select("delete_after")
    .eq("user_id", auth.userId)
    .single();
  if (loadError) console.error("Could not load the storefront deletion deadline.", loadError);
  return {
    ok: true,
    message: "Your storefront is unavailable and scheduled for permanent deletion in 30 days. Contact support before the deadline if you need it recovered.",
    ...(typeof data?.delete_after === "string" ? { deleteAfter: data.delete_after } : {}),
  };
}

function cropDimensions(
  imageWidth: number,
  imageHeight: number,
  aspectRatio: number,
  zoom: number,
  horizontal: number,
  vertical: number,
) {
  let baseWidth = imageWidth;
  let baseHeight = imageHeight;
  if (imageWidth / imageHeight > aspectRatio) {
    baseWidth = Math.round(imageHeight * aspectRatio);
  } else {
    baseHeight = Math.round(imageWidth / aspectRatio);
  }
  const width = Math.max(1, Math.floor(baseWidth / zoom));
  const height = Math.max(1, Math.floor(baseHeight / zoom));
  return {
    left: Math.max(0, Math.min(imageWidth - width, Math.round((imageWidth - width) * horizontal / 100))),
    top: Math.max(0, Math.min(imageHeight - height, Math.round((imageHeight - height) * vertical / 100))),
    width,
    height,
  };
}

export async function uploadStorefrontImageAction(formData: FormData): Promise<StorefrontActionResult> {
  const kind = formData.get("kind");
  const storefrontId = formData.get("storefront_id");
  const file = formData.get("image");
  const zoom = safeImageCrop(formData.get("zoom"));
  const horizontal = safeImageCrop(formData.get("horizontal"));
  const vertical = safeImageCrop(formData.get("vertical"));
  if (
    (kind !== "profile" && kind !== "banner" && kind !== "product") ||
    typeof storefrontId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storefrontId) ||
    !(file instanceof File) ||
    zoom === null || zoom < 1 || zoom > 3 ||
    horizontal === null || horizontal < 0 || horizontal > 100 ||
    vertical === null || vertical < 0 || vertical > 100
  ) {
    return { ok: false, message: "Choose an image and adjust its crop before uploading." };
  }

  const maximumSize = kind === "profile" ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size === 0 || file.size > maximumSize) {
    return {
      ok: false,
      message: `Choose an image smaller than ${kind === "profile" ? "5" : "10"} MB.`,
    };
  }
  const formats: Record<string, "jpeg" | "png" | "webp"> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const expectedFormat = formats[file.type];
  if (!expectedFormat) {
    return { ok: false, message: "Choose a JPG, PNG or WebP image." };
  }

  const auth = await getStorefrontAuth();
  if (!auth.ok) return auth.result;
  const { data: storefront, error: storefrontError } = await auth.supabase
    .from("creator_storefronts")
    .select("id,status")
    .eq("id", storefrontId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (storefrontError) {
    console.error("Could not verify storefront image ownership.", storefrontError);
    return { ok: false, message: "The storefront could not be verified. Refresh and try again." };
  }
  if (!storefront) {
    return { ok: false, message: "You can only upload images to your own storefront." };
  }
  if (storefront.status === "deletion_pending") {
    return { ok: false, message: "This storefront is scheduled for deletion and can no longer be changed." };
  }

  const storageAdmin = createSupabaseAdminClient();
  if (!storageAdmin) {
    return { ok: false, message: "Secure image uploads are not configured. Please contact support." };
  }

  let image: Buffer;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const oriented = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .toBuffer({ resolveWithObject: true });
    const metadata = oriented.info;
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.format !== expectedFormat ||
      metadata.width * metadata.height > 40_000_000
    ) {
      return { ok: false, message: "The image format or dimensions are not supported." };
    }
    const aspectRatio = kind === "banner" ? 3 : kind === "product" ? 4 / 3 : 1;
    const outputSize = kind === "banner" ? { width: 1800, height: 600 } :
      kind === "product" ? { width: 960, height: 720 } : { width: 512, height: 512 };
    image = await sharp(oriented.data)
      .extract(cropDimensions(metadata.width, metadata.height, aspectRatio, zoom, horizontal, vertical))
      .resize(outputSize.width, outputSize.height, { fit: "cover", withoutEnlargement: false })
      .webp({ quality: 84, effort: 4 })
      .toBuffer();
  } catch (imageError) {
    console.error("Could not decode and optimize a storefront image.", imageError);
    return { ok: false, message: "This image could not be processed. Choose another JPG, PNG or WebP file." };
  }

  const path = `${crypto.randomUUID()}.webp`;
  const imagePath = kind === "profile"
    ? `${auth.userId}/${path}`
    : path;
  const bucket = kind === "profile" ? "creator-avatars" : "storefront-assets";
  const { error: uploadError } = await storageAdmin.storage
    .from(bucket)
    .upload(imagePath, image, { contentType: "image/webp", cacheControl: "3600", upsert: false });
  if (uploadError) {
    console.error("Could not upload a storefront image.", uploadError);
    return { ok: false, message: "The image could not be uploaded. Please try again." };
  }

  if (kind !== "profile") {
    const { error: registerError } = await auth.supabase.rpc("register_storefront_asset", {
      requested_storefront_id: storefrontId,
      requested_path: imagePath,
    });
    if (registerError) {
      console.error("Could not register a storefront image.", registerError);
      const { error: cleanupError } = await storageAdmin.storage.from(bucket).remove([imagePath]);
      if (cleanupError) console.error("Could not clean up an unregistered storefront image.", cleanupError);
      return { ok: false, message: "The uploaded image could not be attached to this storefront." };
    }
  }

  let imageUrl: string;
  if (kind === "profile") {
    const { data: signedImage, error: signedImageError } = await auth.supabase.storage
      .from("creator-avatars")
      .createSignedUrl(imagePath, 60 * 60 * 12);
    if (signedImageError || !signedImage?.signedUrl) {
      console.error("Could not prepare an uploaded shared creator profile photo.", signedImageError);
      const { error: cleanupError } = await storageAdmin.storage.from(bucket).remove([imagePath]);
      if (cleanupError) console.error("Could not clean up an unpreviewable creator avatar.", cleanupError);
      return { ok: false, message: "The uploaded image could not be prepared for preview." };
    }
    imageUrl = signedImage.signedUrl;
  } else {
    imageUrl = auth.supabase.storage.from(bucket).getPublicUrl(imagePath).data.publicUrl;
  }
  return { ok: true, message: "Image uploaded.", path: imagePath, imageUrl };
}
