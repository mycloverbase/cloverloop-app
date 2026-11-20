import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const sourceBucket = "creator-avatars";
const destinationBucket = "storefront-assets";
const pageSize = 100;
const applyChanges = process.argv.includes("--apply");
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const avatarPathPattern = new RegExp(`^${uuid}/${uuid}\\.webp$`, "i");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this migration.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});

async function listAvatarFiles(folder = "") {
  const files = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage.from(sourceBucket).list(folder, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Could not list creator avatars in "${folder || "/"}": ${error.message}`);

    for (const entry of data) {
      const path = folder ? `${folder}/${entry.name}` : entry.name;
      if (entry.id === null) {
        files.push(...await listAvatarFiles(path));
      } else {
        if (!avatarPathPattern.test(path)) {
          throw new Error(`Unexpected object in ${sourceBucket}; expected an owner-scoped WebP avatar.`);
        }
        files.push(path);
      }
    }

    if (data.length < pageSize) break;
  }
  return files;
}

const paths = await listAvatarFiles();
console.log(`Found ${paths.length} creator avatar image(s).`);

if (!applyChanges) {
  console.log("Dry run only. Re-run with --apply to copy these images into public storefront storage.");
  console.log("This makes every copied avatar anonymously accessible through storefront-assets.");
  process.exit(0);
}

let copied = 0;
for (const path of paths) {
  const { data: image, error: downloadError } = await supabase.storage
    .from(sourceBucket)
    .download(path);
  if (downloadError || !image) {
    throw new Error(`Could not download a creator avatar: ${downloadError?.message ?? "No image returned"}`);
  }
  if (image.type && image.type !== "image/webp") {
    throw new Error("A creator avatar has an unexpected content type; refusing to publish it.");
  }

  const { error: uploadError } = await supabase.storage
    .from(destinationBucket)
    .upload(path, image, { contentType: "image/webp", cacheControl: "3600", upsert: true });
  if (uploadError) {
    throw new Error(`Could not copy a creator avatar into storefront storage: ${uploadError.message}`);
  }

  const publicUrl = supabase.storage.from(destinationBucket).getPublicUrl(path).data.publicUrl;
  const response = await fetch(publicUrl, { method: "HEAD" });
  if (!response.ok) {
    throw new Error(`A copied avatar is not publicly readable (HTTP ${response.status}).`);
  }
  copied += 1;
}

console.log(`Copied ${copied} image(s) to ${destinationBucket}; the private originals were retained.`);
