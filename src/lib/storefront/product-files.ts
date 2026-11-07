export const MAX_PRODUCT_FILE_SIZE = 100 * 1024 * 1024;
export const PRODUCT_FILE_ACCEPT =
  ".pdf,.mp3,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.epub,.zip,.txt,.rtf,.mp4,.wav,.jpg,.jpeg,.png,.webp";

const supportedTypes: Record<string, { mimeType: string; aliases: string[] }> = {
  pdf: { mimeType: "application/pdf", aliases: [] },
  mp3: { mimeType: "audio/mpeg", aliases: ["audio/mp3"] },
  doc: { mimeType: "application/msword", aliases: [] },
  docx: {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    aliases: [],
  },
  ppt: { mimeType: "application/vnd.ms-powerpoint", aliases: [] },
  pptx: {
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    aliases: [],
  },
  xls: { mimeType: "application/vnd.ms-excel", aliases: [] },
  xlsx: {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    aliases: [],
  },
  epub: { mimeType: "application/epub+zip", aliases: [] },
  zip: { mimeType: "application/zip", aliases: ["application/x-zip-compressed"] },
  txt: { mimeType: "text/plain", aliases: [] },
  rtf: { mimeType: "application/rtf", aliases: ["text/rtf"] },
  mp4: { mimeType: "video/mp4", aliases: [] },
  wav: { mimeType: "audio/wav", aliases: ["audio/x-wav"] },
  jpg: { mimeType: "image/jpeg", aliases: [] },
  jpeg: { mimeType: "image/jpeg", aliases: [] },
  png: { mimeType: "image/png", aliases: [] },
  webp: { mimeType: "image/webp", aliases: [] },
};

export type ProductFileMetadata = {
  fileName: string;
  extension: string;
  mimeType: string;
  size: number;
};

export type ProductFileValidation =
  | { ok: true; value: ProductFileMetadata }
  | { ok: false; message: string };

export function validateProductFileMetadata(
  fileName: string,
  size: number,
  mimeType: string,
): ProductFileValidation {
  const cleanName = fileName
    .replace(/[\\/]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  const extension = cleanName.split(".").pop()?.toLowerCase() ?? "";
  const format = supportedTypes[extension];
  if (!format) {
    return { ok: false, message: "Choose a supported file format (PDF, MP3, DOC, DOCX, and more)." };
  }
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_PRODUCT_FILE_SIZE) {
    return { ok: false, message: "Product files must be larger than 0 bytes and no larger than 100 MB." };
  }
  const normalizedType = mimeType.trim().toLowerCase();
  if (normalizedType && normalizedType !== format.mimeType && !format.aliases.includes(normalizedType)) {
    return { ok: false, message: "The selected file type does not match its file extension." };
  }
  if (!cleanName || cleanName.length > 255) {
    return { ok: false, message: "The product file name must be 255 characters or fewer." };
  }
  return {
    ok: true,
    value: { fileName: cleanName, extension, mimeType: format.mimeType, size },
  };
}
