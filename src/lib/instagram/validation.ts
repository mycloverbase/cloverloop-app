export type InstagramAutomationInput = {
  connectionId: string;
  name: string;
  mediaId: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  mediaPermalink: string;
  mediaCaption: string;
  keywords: string[];
  matchType: "whole_word" | "exact_comment";
  replyMessage: string;
  targetProductId: string | null;
  status: "active" | "paused";
};

type Validation<T> = { ok: true; value: T } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parseInstagramAutomationInput(value: unknown): Validation<InstagramAutomationInput> {
  if (!isRecord(value)) return { ok: false, message: "Automation details are missing." };
  const connectionId = value.connectionId;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const mediaId = typeof value.mediaId === "string" ? value.mediaId.trim() : "";
  const mediaType = value.mediaType;
  const mediaPermalink = typeof value.mediaPermalink === "string" ? value.mediaPermalink.trim() : "";
  const mediaCaption = typeof value.mediaCaption === "string" ? value.mediaCaption.trim() : "";
  const replyMessage = typeof value.replyMessage === "string" ? value.replyMessage.trim() : "";
  const targetProductId = value.targetProductId === null || value.targetProductId === ""
    ? null
    : value.targetProductId;
  const matchType = value.matchType ?? "whole_word";
  const status = value.status ?? "paused";
  if (!uuid(connectionId)) return { ok: false, message: "Choose a connected Instagram account." };
  if (!name || name.length > 80) return { ok: false, message: "Enter an automation name of 1–80 characters." };
  if (!mediaId || mediaId.length > 200) return { ok: false, message: "Choose a valid Instagram post or Reel." };
  if (!["IMAGE", "VIDEO", "CAROUSEL_ALBUM"].includes(String(mediaType))) {
    return { ok: false, message: "Live and unsupported Instagram media cannot be automated." };
  }
  try {
    const permalink = new URL(mediaPermalink);
    if (permalink.protocol !== "https:" || permalink.hostname !== "www.instagram.com") {
      return { ok: false, message: "Choose a post or Reel from the connected Instagram account." };
    }
  } catch {
    return { ok: false, message: "Choose a valid Instagram post or Reel." };
  }
  if (mediaCaption.length > 2200) return { ok: false, message: "The post caption is too long." };
  if (!Array.isArray(value.keywords) || value.keywords.length < 1 || value.keywords.length > 10) {
    return { ok: false, message: "Add between one and ten trigger keywords." };
  }
  const keywords: string[] = [];
  const normalizedKeywords = new Set<string>();
  for (const rawKeyword of value.keywords) {
    if (typeof rawKeyword !== "string") return { ok: false, message: "Trigger keywords must be text." };
    const keyword = rawKeyword.normalize("NFKC").trim().replace(/\s+/g, " ");
    const normalized = keyword.toLowerCase();
    if (!keyword || keyword.length > 40 || /[\u0000-\u001f]/.test(keyword)) {
      return { ok: false, message: "Each keyword must contain 1–40 valid characters." };
    }
    if (normalizedKeywords.has(normalized)) {
      return { ok: false, message: "Remove duplicate keywords (matching ignores case and extra spaces)." };
    }
    normalizedKeywords.add(normalized);
    keywords.push(keyword);
  }
  if (matchType !== "whole_word" && matchType !== "exact_comment") {
    return { ok: false, message: "Choose a supported keyword matching mode." };
  }
  if (!replyMessage || [...replyMessage].length > 900) {
    return { ok: false, message: "The private reply text must be 1–900 characters before its CloverLoop link." };
  }
  if (/(?:https?:\/\/|www\.)/i.test(replyMessage)) {
    return { ok: false, message: "Choose a CloverLoop storefront or product link separately; external links are not allowed." };
  }
  if (targetProductId !== null && !uuid(targetProductId)) {
    return { ok: false, message: "Choose a valid product link." };
  }
  if (status !== "active" && status !== "paused") {
    return { ok: false, message: "Choose whether the automation is active or paused." };
  }
  return {
    ok: true,
    value: {
      connectionId,
      name,
      mediaId,
      mediaType: mediaType as InstagramAutomationInput["mediaType"],
      mediaPermalink,
      mediaCaption,
      keywords,
      matchType,
      replyMessage,
      targetProductId,
      status,
    },
  };
}

export function isInstagramUuid(value: unknown): value is string {
  return uuid(value);
}
