"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProductFileMetadata } from "@/lib/storefront/product-files";

export async function uploadProductFile(
  file: File,
  path: string,
  metadata: ProductFileMetadata,
  onProgress: (progress: number) => void,
): Promise<void> {
  const { data, error } = await createSupabaseBrowserClient().auth.getSession();
  if (error || !data.session?.access_token) {
    if (error) console.error("Could not retrieve the creator session for product upload.", error);
    throw new Error("Your session expired. Sign in again before uploading.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Private product storage is not configured.");

  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    request.open("POST", `${url.replace(/\/$/, "")}/storage/v1/object/product-files/${encodedPath}`);
    request.setRequestHeader("Authorization", `Bearer ${data.session.access_token}`);
    request.setRequestHeader("apikey", anonKey);
    request.setRequestHeader("Content-Type", metadata.mimeType);
    request.setRequestHeader("x-upsert", "false");
    request.timeout = 10 * 60 * 1000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
      } else {
        let responseMessage: string | null = null;
        try {
          const response = JSON.parse(request.responseText) as { message?: unknown; error?: unknown };
          if (typeof response.message === "string") responseMessage = response.message;
          else if (typeof response.error === "string") responseMessage = response.error;
        } catch {
          responseMessage = null;
        }
        console.error("Supabase Storage rejected a product file upload.", {
          status: request.status,
          message: responseMessage,
        });
        if (request.status === 401 || request.status === 403) {
          reject(new Error(
            `Storage denied the upload (HTTP ${request.status}). Refresh the page; if it continues, check the product-files upload policy.`,
          ));
        } else if (request.status === 404) {
          reject(new Error("The private product-files bucket was not found. Confirm the product migration was applied."));
        } else if (request.status === 413) {
          reject(new Error("Storage rejected the file size. Check the project and bucket upload limits."));
        } else if (request.status === 415) {
          reject(new Error("Storage rejected this file type. Check the product-files bucket MIME type settings."));
        } else {
          const detail = responseMessage ? ` ${responseMessage.slice(0, 180)}` : "";
          reject(new Error(`Supabase Storage rejected the upload (HTTP ${request.status}).${detail}`));
        }
      }
    };
    request.onerror = () => reject(new Error("The product file upload failed. Check your connection and try again."));
    request.ontimeout = () => reject(new Error("The product file upload timed out. Please try again."));
    request.onabort = () => reject(new Error("The product file upload was cancelled."));
    request.send(file);
  });
}
