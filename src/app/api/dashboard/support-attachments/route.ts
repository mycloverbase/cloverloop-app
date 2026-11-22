import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { creatorAgreementIsAccepted } from "@/lib/account/creator-agreement-consent";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_SUPPORT_ATTACHMENT_BYTES } from "@/lib/creator-support";

export const runtime = "nodejs";

const bucket = "support-attachments";
const maxRequestBytes = MAX_SUPPORT_ATTACHMENT_BYTES + 128 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const mimeByFormat: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function jsonError(message: string, status: number) {
  return Response.json({ ok: false, message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function readBoundedFormData(request: Request): Promise<FormData | null> {
  const reader = request.body?.getReader();
  const contentType = request.headers.get("content-type");
  if (!reader || !contentType) return null;

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxRequestBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const boundedRequest = new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
  return boundedRequest.formData();
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("This upload request could not be verified.", 403);

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > maxRequestBytes) {
      return jsonError("Each screenshot must be 5 MB or smaller.", 413);
    }
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return jsonError("Screenshot uploads are not configured.", 503);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    if (authError) console.error("Could not verify a creator support screenshot upload.", authError);
    return jsonError("Please sign in again before uploading a screenshot.", 401);
  }
  if (!(await creatorAgreementIsAccepted(supabase))) {
    return jsonError("Accept the Creator Agreement before uploading screenshots.", 403);
  }

  let formData: FormData;
  try {
    const parsedFormData = await readBoundedFormData(request);
    if (!parsedFormData) return jsonError("Each screenshot must be 5 MB or smaller.", 413);
    formData = parsedFormData;
  } catch (formError) {
    console.error("Could not read a creator support screenshot upload.", formError);
    return jsonError("The screenshot could not be read. Please try again.", 400);
  }
  const files = formData.getAll("file");
  const file = files[0];
  if (files.length !== 1 || !(file instanceof File)) {
    return jsonError("Choose one screenshot at a time.", 400);
  }
  if (!file.size || file.size > MAX_SUPPORT_ATTACHMENT_BYTES) {
    return jsonError("Each screenshot must be between 1 byte and 5 MB.", 413);
  }
  if (!allowedTypes.has(file.type)) {
    return jsonError("Use a PNG, JPG or WebP screenshot.", 415);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonError("Private screenshot storage is not configured.", 503);

  let optimizedImage: Buffer;
  try {
    const source = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(source, {
      failOn: "error",
      limitInputPixels: 40_000_000,
    }).metadata();
    if (!metadata.format || mimeByFormat[metadata.format] !== file.type) {
      return jsonError("The file contents do not match a supported image format.", 415);
    }
    optimizedImage = await sharp(source, {
      failOn: "error",
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
  } catch (imageError) {
    console.error("Could not process a creator support screenshot.", imageError);
    return jsonError("This image could not be processed. Try a PNG, JPG or WebP screenshot.", 415);
  }

  const path = `${user.id}/${randomUUID()}.webp`;
  const { error: uploadError } = await admin.storage.from(bucket).upload(path, optimizedImage, {
    contentType: "image/webp",
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) {
    console.error("Could not save a private creator support screenshot.", { code: uploadError.name });
    return jsonError("The screenshot could not be uploaded. Please try again.", 500);
  }

  return Response.json({ ok: true, path }, {
    headers: { "Cache-Control": "no-store" },
  });
}
