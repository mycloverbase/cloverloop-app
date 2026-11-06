import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type StorefrontForPurge = { id: string };
type AssetForPurge = { path: string };

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
  return json({ deletedStorefronts, removedAbandonedImages: abandonedPaths.length });
});
