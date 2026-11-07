"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateProductFileMetadata } from "@/lib/storefront/product-files";

export type ProductActionResult =
  | { ok: true; message: string; productId?: string; uploadPath?: string }
  | { ok: false; message: string };

type ProductInput = {
  name: string;
  description: string;
  category: string | null;
  isFree: boolean;
  pricePaise: number;
  coverImagePath: string | null;
  isActive: boolean;
};

type ProductAuth =
  | {
      ok: true;
      supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
      userId: string;
    }
  | { ok: false; result: ProductActionResult };

type ProductStoragePaths =
  | {
      ok: true;
      storefrontId: string;
      filePath: string | null;
      pendingFilePath: string | null;
      retiredFilePath: string | null;
    }
  | { ok: false; message: string };

async function getProductAuth(): Promise<ProductAuth> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, result: { ok: false, message: "Product services are not configured." } };
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    if (error) console.error("Could not verify a product action.", error);
    return { ok: false, result: { ok: false, message: "Please sign in again to continue." } };
  }
  return { ok: true, supabase, userId: user.id };
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseProductInput(value: unknown): ProductInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.name !== "string" ||
    input.name.trim().length < 1 ||
    input.name.trim().length > 100 ||
    typeof input.description !== "string" ||
    input.description.trim().length < 1 ||
    input.description.trim().length > 5000 ||
    (input.category !== null && typeof input.category !== "string") ||
    (typeof input.category === "string" && input.category.trim().length > 50) ||
    typeof input.isFree !== "boolean" ||
    typeof input.pricePaise !== "number" ||
    !Number.isSafeInteger(input.pricePaise) ||
    input.pricePaise < 0 ||
    typeof input.coverImagePath !== "string" && input.coverImagePath !== null ||
    typeof input.isActive !== "boolean"
  ) return null;
  const pricePaise = input.pricePaise;
  if (
    pricePaise > Number.MAX_SAFE_INTEGER ||
    (input.isFree && pricePaise !== 0) ||
    (!input.isFree && pricePaise === 0)
  ) return null;
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    category: typeof input.category === "string" ? input.category.trim() || null : null,
    isFree: input.isFree,
    pricePaise,
    coverImagePath: input.coverImagePath as string | null,
    isActive: input.isActive,
  };
}

function productErrorMessage(error: { code?: string; message?: string }): string {
  const message = error.message ?? "";
  if (message.includes("Free product listing limit reached")) {
    return "Your Free plan allows five free product listings per account lifetime.";
  }
  if (message.includes("Paid product listing limit reached")) {
    return "Your Free plan allows one paid product listing per account lifetime.";
  }
  if (message.includes("A product file is required")) {
    return "Upload a product file before saving or activating this product.";
  }
  if (message.includes("Previous product file cleanup is pending")) {
    return "The previous product file is still being cleaned up. Try again shortly.";
  }
  if (message.includes("Unsupported product file")) {
    return "Choose a supported file format and file name.";
  }
  if (message.includes("deletion_pending") || message.includes("Storefront not found")) {
    return "This storefront is scheduled for deletion and can no longer be changed.";
  }
  if (error.code === "23514" || message.includes("Invalid product")) {
    return "Some product details or file information are invalid. Review the form and try again.";
  }
  console.error("A product database action failed.", error);
  return "The product could not be updated. Please try again.";
}

async function getProductStoragePaths(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  productId: string,
  userId: string,
): Promise<ProductStoragePaths> {
  const { data, error } = await supabase
    .from("storefront_products")
    .select("storefront_id,file_path,pending_file_path,retired_file_path")
    .eq("id", productId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("Could not load owned product file paths.", error);
    return { ok: false, message: "The product could not be loaded. Refresh and try again." };
  }
  if (!data) return { ok: false, message: "Product not found." };
  return {
    ok: true,
    storefrontId: data.storefront_id as string,
    filePath: typeof data.file_path === "string" ? data.file_path : null,
    pendingFilePath: typeof data.pending_file_path === "string" ? data.pending_file_path : null,
    retiredFilePath: typeof data.retired_file_path === "string" ? data.retired_file_path : null,
  };
}

async function removeProductFiles(paths: (string | null)[]) {
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (!uniquePaths.length) return { ok: true as const, admin: null };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false as const, message: "Private file storage is not configured." };
  const { error } = await admin.storage.from("product-files").remove(uniquePaths);
  if (error) {
    console.error("Could not remove private product files.", error);
    return { ok: false as const, message: "A previous private file could not be removed. Try again shortly." };
  }
  return { ok: true as const, admin };
}

async function clearRetiredFile(
  productId: string,
  userId: string,
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
) {
  const { error } = await admin
    .from("storefront_products")
    .update({ retired_file_path: null })
    .eq("id", productId)
    .eq("user_id", userId);
  if (error) console.error("Could not clear the retired product file reference.", error);
}

async function revalidateStorefront(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  storefrontId: string,
) {
  const { data, error } = await supabase
    .from("creator_storefronts")
    .select("username")
    .eq("id", storefrontId)
    .maybeSingle();
  if (error) {
    console.error("Could not load the product storefront URL for revalidation.", error);
    return;
  }
  if (typeof data?.username === "string") revalidatePath(`/${data.username}`);
}

export async function createProductDraftAction(
  storefrontId: string,
  input: unknown,
): Promise<ProductActionResult> {
  if (!isUuid(storefrontId)) return { ok: false, message: "Save your storefront before adding products." };
  const product = parseProductInput(input);
  if (!product) return { ok: false, message: "Enter a product name, description, and valid price." };
  const auth = await getProductAuth();
  if (!auth.ok) return auth.result;
  const { data, error } = await auth.supabase.rpc("create_storefront_product_draft", {
    requested_storefront_id: storefrontId,
    requested_name: product.name,
    requested_description: product.description,
    requested_category: product.category,
    requested_is_free: product.isFree,
    requested_price_paise: product.pricePaise,
    requested_cover_image_path: product.coverImagePath,
  });
  if (error) return { ok: false, message: productErrorMessage(error) };
  if (typeof data !== "string") {
    console.error("The product draft action returned an invalid product ID.");
    return { ok: false, message: "The product draft could not be created. Please try again." };
  }
  return { ok: true, message: "Product draft created.", productId: data };
}

export async function prepareProductFileUploadAction(
  productId: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
): Promise<ProductActionResult> {
  if (!isUuid(productId)) return { ok: false, message: "Choose a valid product before uploading." };
  const file = validateProductFileMetadata(fileName, fileSize, mimeType);
  if (!file.ok) return file;
  const auth = await getProductAuth();
  if (!auth.ok) return auth.result;
  const paths = await getProductStoragePaths(auth.supabase, productId, auth.userId);
  if (!paths.ok) return { ok: false, message: paths.message };

  const cleanup = await removeProductFiles([paths.pendingFilePath, paths.retiredFilePath]);
  if (!cleanup.ok) return { ok: false, message: cleanup.message };
  if (paths.retiredFilePath && cleanup.admin) {
    await clearRetiredFile(productId, auth.userId, cleanup.admin);
  }

  const { data, error } = await auth.supabase.rpc("begin_storefront_product_upload", {
    requested_product_id: productId,
    requested_extension: file.value.extension,
    requested_file_name: file.value.fileName,
  });
  if (error) return { ok: false, message: productErrorMessage(error) };
  if (typeof data !== "string") {
    console.error("The product file upload slot returned an invalid path.");
    return { ok: false, message: "A secure upload could not be started. Please try again." };
  }
  return { ok: true, message: "Secure upload ready.", uploadPath: data };
}

export async function saveProductAction(productId: string, input: unknown): Promise<ProductActionResult> {
  if (!isUuid(productId)) return { ok: false, message: "Choose a valid product before saving." };
  const product = parseProductInput(input);
  if (!product) return { ok: false, message: "Enter a product name, description, and valid price." };
  const auth = await getProductAuth();
  if (!auth.ok) return auth.result;
  const paths = await getProductStoragePaths(auth.supabase, productId, auth.userId);
  if (!paths.ok) return { ok: false, message: paths.message };

  const { error } = await auth.supabase.rpc("save_storefront_product", {
    requested_product_id: productId,
    requested_name: product.name,
    requested_description: product.description,
    requested_category: product.category,
    requested_is_free: product.isFree,
    requested_price_paise: product.pricePaise,
    requested_cover_image_path: product.coverImagePath,
    requested_is_active: product.isActive,
  });
  if (error) return { ok: false, message: productErrorMessage(error) };

  const { data: updated, error: updatedError } = await auth.supabase
    .from("storefront_products")
    .select("retired_file_path")
    .eq("id", productId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (updatedError) {
    console.error("Could not load retired product file after saving.", updatedError);
    await revalidateStorefront(auth.supabase, paths.storefrontId);
    revalidatePath("/dashboard/products");
    return {
      ok: true,
      message: "Product saved. Its previous private file is scheduled for secure cleanup.",
    };
  } else if (typeof updated?.retired_file_path === "string") {
    const cleanup = await removeProductFiles([updated.retired_file_path]);
    if (cleanup.ok && cleanup.admin) {
      await clearRetiredFile(productId, auth.userId, cleanup.admin);
    } else if (!cleanup.ok) {
      await revalidateStorefront(auth.supabase, paths.storefrontId);
      revalidatePath("/dashboard/products");
      return {
        ok: true,
        message: "Product saved. Its previous private file is scheduled for secure cleanup.",
      };
    }
  }
  await revalidateStorefront(auth.supabase, paths.storefrontId);
  revalidatePath("/dashboard/products");
  return { ok: true, message: "Product saved." };
}

export async function deleteProductAction(productId: string): Promise<ProductActionResult> {
  if (!isUuid(productId)) return { ok: false, message: "Choose a valid product before deleting." };
  const auth = await getProductAuth();
  if (!auth.ok) return auth.result;
  const paths = await getProductStoragePaths(auth.supabase, productId, auth.userId);
  if (!paths.ok) return { ok: false, message: paths.message };

  const { error } = await auth.supabase.rpc("delete_storefront_product", {
    requested_product_id: productId,
  });
  if (error) return { ok: false, message: productErrorMessage(error) };

  const cleanup = await removeProductFiles([paths.filePath, paths.pendingFilePath, paths.retiredFilePath]);
  if (cleanup.ok && cleanup.admin) {
    const { error: clearError } = await cleanup.admin
      .from("storefront_products")
      .update({
        file_path: null,
        file_name: null,
        file_size: null,
        file_mime_type: null,
        pending_file_path: null,
        pending_file_name: null,
        pending_file_expires_at: null,
        retired_file_path: null,
      })
      .eq("id", productId)
      .eq("user_id", auth.userId);
    if (clearError) console.error("Could not clear deleted product file references.", clearError);
  }
  await revalidateStorefront(auth.supabase, paths.storefrontId);
  revalidatePath("/dashboard/products");
  return {
    ok: true,
    message: cleanup.ok
      ? "Product deleted."
      : "Product deleted. Its private files are scheduled for secure cleanup.",
  };
}
