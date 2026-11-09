"use server";

import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  const storefront = parsed.value;
  const { data: previousStorefront, error: previousStorefrontError } = await auth.supabase
    .from("creator_storefronts")
    .select("username")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (previousStorefrontError) {
    console.error("Could not load the previous storefront username.", previousStorefrontError);
    return { ok: false, message: "Your storefront could not be updated. Please try again." };
  }
  const { data, error } = await auth.supabase.rpc("save_my_storefront", {
    requested_store_name: storefront.storeName,
    requested_username: storefront.username,
    requested_description: storefront.description,
    requested_profile_image_path: storefront.profileImagePath,
    requested_banner_image_path: storefront.bannerImagePath,
    requested_theme: storefront.theme,
    requested_customization: storefront.customization,
  });
  if (error) return { ok: false, message: databaseMessage(error) };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard/storefront");
  if (previousStorefront?.username) revalidatePath(`/${previousStorefront.username}`);
  revalidatePath(`/${storefront.username}`);
  return {
    ok: true,
    message: "Storefront changes saved.",
    ...(typeof data === "string" ? { storefrontId: data } : {}),
  };
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
    message: "Your storefront is unavailable and scheduled for permanent deletion in 30 days. It cannot be restored.",
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
  const { error: uploadError } = await storageAdmin.storage
    .from("storefront-assets")
    .upload(path, image, { contentType: "image/webp", cacheControl: "3600", upsert: false });
  if (uploadError) {
    console.error("Could not upload a storefront image.", uploadError);
    return { ok: false, message: "The image could not be uploaded. Please try again." };
  }

  const { error: registerError } = await auth.supabase.rpc("register_storefront_asset", {
    requested_storefront_id: storefrontId,
    requested_path: path,
  });
  if (registerError) {
    console.error("Could not register a storefront image.", registerError);
    const { error: cleanupError } = await storageAdmin.storage.from("storefront-assets").remove([path]);
    if (cleanupError) console.error("Could not clean up an unregistered storefront image.", cleanupError);
    return { ok: false, message: "The uploaded image could not be attached to this storefront." };
  }

  const imageUrl = auth.supabase.storage.from("storefront-assets").getPublicUrl(path).data.publicUrl;
  return { ok: true, message: "Image uploaded.", path, imageUrl };
}
