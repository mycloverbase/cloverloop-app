import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type StorefrontForPurge = { id: string };
type AssetForPurge = { path: string };
type ProductFilesForPurge = {
  id: string;
  user_id: string;
  storefront_id: string;
  file_path: string | null;
  pending_file_path: string | null;
  retired_file_path: string | null;
};

function uniquePaths(paths: (string | null)[]) {
  return [...new Set(paths.filter((path): path is string => Boolean(path)))];
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  const purgeSecret = Deno.env.get("STOREFRONT_PURGE_SECRET");
  const authorization = request.headers.get("authorization");
  if (!purgeSecret || authorization !== `Bearer ${purgeSecret}`) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Storefront purge function is missing Supabase server configuration.");
    return json({ error: "Purge service is not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const productCleanupFailures: string[] = [];

  const { data: deletedProducts, error: deletedProductsError } = await supabase
    .from("storefront_products")
    .select("id,user_id,storefront_id,file_path,pending_file_path,retired_file_path")
    .not("deleted_at", "is", null)
    .or("file_path.not.is.null,pending_file_path.not.is.null,retired_file_path.not.is.null")
    .limit(500);
  if (deletedProductsError) {
    console.error("Could not load deleted product files for cleanup.", deletedProductsError);
    return json({ error: "Deleted product files could not be loaded" }, 500);
  }
  for (const product of (deletedProducts ?? []) as ProductFilesForPurge[]) {
    const paths = uniquePaths([product.file_path, product.pending_file_path, product.retired_file_path]);
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from("product-files").remove(paths);
      if (storageError) {
        console.error("Could not remove deleted product files.", storageError);
        productCleanupFailures.push(product.id);
        continue;
      }
    }
    const { error: clearError } = await supabase
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
      .eq("id", product.id)
      .eq("user_id", product.user_id)
      .not("deleted_at", "is", null);
    if (clearError) {
      console.error("Could not clear deleted product file records.", clearError);
      productCleanupFailures.push(product.id);
    }
  }

  const { data: expiredUploads, error: expiredUploadsError } = await supabase
    .from("storefront_products")
    .select("id,pending_file_path")
    .not("pending_file_path", "is", null)
    .lt("pending_file_expires_at", new Date().toISOString())
    .limit(500);
  if (expiredUploadsError) {
    console.error("Could not load expired product uploads.", expiredUploadsError);
    return json({ error: "Expired product uploads could not be loaded" }, 500);
  }
  for (const upload of (expiredUploads ?? []) as { id: string; pending_file_path: string }[]) {
    const { error: storageError } = await supabase.storage
      .from("product-files")
      .remove([upload.pending_file_path]);
    if (storageError) {
      console.error("Could not remove an expired product upload.", storageError);
      productCleanupFailures.push(upload.id);
      continue;
    }
    const { error: clearError } = await supabase
      .from("storefront_products")
      .update({
        pending_file_path: null,
        pending_file_name: null,
        pending_file_expires_at: null,
      })
      .eq("id", upload.id)
      .eq("pending_file_path", upload.pending_file_path)
      .lt("pending_file_expires_at", new Date().toISOString());
    if (clearError) {
      console.error("Could not clear an expired product upload record.", clearError);
      productCleanupFailures.push(upload.id);
    }
  }

  const { data: retiredFiles, error: retiredFilesError } = await supabase
    .from("storefront_products")
    .select("id,user_id,retired_file_path")
    .not("retired_file_path", "is", null)
    .is("deleted_at", null)
    .limit(500);
  if (retiredFilesError) {
    console.error("Could not load retired product files.", retiredFilesError);
    return json({ error: "Retired product files could not be loaded" }, 500);
  }
  for (const product of (retiredFiles ?? []) as { id: string; user_id: string; retired_file_path: string }[]) {
    const { error: storageError } = await supabase.storage
      .from("product-files")
      .remove([product.retired_file_path]);
    if (storageError) {
      console.error("Could not remove a retired product file.", storageError);
      productCleanupFailures.push(product.id);
      continue;
    }
    const { error: clearError } = await supabase
      .from("storefront_products")
      .update({ retired_file_path: null })
      .eq("id", product.id)
      .eq("user_id", product.user_id)
      .eq("retired_file_path", product.retired_file_path);
    if (clearError) {
      console.error("Could not clear a retired product file record.", clearError);
      productCleanupFailures.push(product.id);
    }
  }

  const { data: expired, error: expiredError } = await supabase
    .from("creator_storefronts")
    .select("id")
    .eq("status", "deletion_pending")
    .lte("delete_after", new Date().toISOString())
    .limit(500);
  if (expiredError) {
    console.error("Could not load storefronts ready for deletion.", expiredError);
    return json({ error: "Expired storefronts could not be loaded" }, 500);
  }

  let deletedStorefronts = 0;
  const failures: string[] = [];
  for (const storefront of (expired ?? []) as StorefrontForPurge[]) {
    const { data: productFiles, error: productFilesError } = await supabase
      .from("storefront_products")
      .select("id,user_id,storefront_id,file_path,pending_file_path,retired_file_path")
      .eq("storefront_id", storefront.id);
    if (productFilesError) {
      console.error("Could not load product files for an expired storefront.", productFilesError);
      productCleanupFailures.push(storefront.id);
      failures.push(storefront.id);
      continue;
    }
    const productPaths = uniquePaths(
      ((productFiles ?? []) as ProductFilesForPurge[]).flatMap((product) => [
        product.file_path,
        product.pending_file_path,
        product.retired_file_path,
      ]),
    );
    if (productPaths.length) {
      const { error: productStorageError } = await supabase.storage
        .from("product-files")
        .remove(productPaths);
      if (productStorageError) {
        console.error("Could not remove product files for an expired storefront.", productStorageError);
        productCleanupFailures.push(storefront.id);
        failures.push(storefront.id);
        continue;
      }
    }

    const { data: assets, error: assetsError } = await supabase
      .from("storefront_assets")
      .select("path")
      .eq("storefront_id", storefront.id);
    if (assetsError) {
      console.error("Could not load expired storefront assets.", assetsError);
      failures.push(storefront.id);
      continue;
    }

    const paths = ((assets ?? []) as AssetForPurge[]).map((asset) => asset.path);
    if (paths.length) {
      const { error: storageError } = await supabase.storage
        .from("storefront-assets")
        .remove(paths);
      if (storageError) {
        console.error("Could not remove expired storefront images.", storageError);
        failures.push(storefront.id);
        continue;
      }
    }

    const { error: deleteError } = await supabase
      .from("creator_storefronts")
      .delete()
      .eq("id", storefront.id)
      .eq("status", "deletion_pending")
      .lte("delete_after", new Date().toISOString());
    if (deleteError) {
      console.error("Could not permanently delete an expired storefront.", deleteError);
      failures.push(storefront.id);
      continue;
    }
    deletedStorefronts += 1;
  }

  const abandonedBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: abandonedAssets, error: abandonedError } = await supabase
    .from("storefront_assets")
    .select("path")
    .eq("is_referenced", false)
    .lt("created_at", abandonedBefore)
    .limit(500);
  if (abandonedError) {
    console.error("Could not load abandoned storefront images.", abandonedError);
    return json({ error: "Abandoned storefront images could not be loaded" }, 500);
  }
  const abandonedPaths = ((abandonedAssets ?? []) as AssetForPurge[]).map((asset) => asset.path);
  if (abandonedPaths.length) {
    const { error: storageError } = await supabase.storage
      .from("storefront-assets")
      .remove(abandonedPaths);
    if (storageError) {
      console.error("Could not remove abandoned storefront images.", storageError);
      return json({ error: "Abandoned storefront images could not be removed" }, 500);
    }
    const { error: registryError } = await supabase
      .from("storefront_assets")
      .delete()
      .in("path", abandonedPaths)
      .eq("is_referenced", false);
    if (registryError) {
      console.error("Could not clear abandoned storefront image records.", registryError);
      return json({ error: "Abandoned storefront image records could not be cleared" }, 500);
    }
  }

  if (failures.length) {
    return json({ deletedStorefronts, failedStorefronts: failures }, 500);
  }
  if (productCleanupFailures.length) {
    return json({ deletedStorefronts, failedProductFiles: productCleanupFailures }, 500);
  }
  return json({
    deletedStorefronts,
    removedAbandonedImages: abandonedPaths.length,
    cleanedDeletedProducts: deletedProducts?.length ?? 0,
    cleanedExpiredUploads: expiredUploads?.length ?? 0,
    cleanedRetiredFiles: retiredFiles?.length ?? 0,
  });
});
