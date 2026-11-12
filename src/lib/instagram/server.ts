import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const INSTAGRAM_OAUTH_STATE_COOKIE = "cloverloop_instagram_oauth_state";
export const INSTAGRAM_REQUIRED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
] as const;
export const INSTAGRAM_REPLY_MAX_LENGTH = 1000;
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

export type InstagramConfig = {
  appId: string;
  appSecret: string;
  webhookVerifyToken: string;
  graphApiVersion: string;
  redirectUri: string;
};

export type InstagramMedia = {
  id: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_product_type: string;
  permalink: string;
  caption?: string;
  timestamp: string;
};

export type InstagramConnection = {
  id: string;
  creator_id: string;
  instagram_user_id: string;
  instagram_username: string;
  access_token_encrypted: string;
  token_expires_at: string;
  granted_scopes: string[];
  connection_status: "connected" | "reauthorization_required" | "disconnected";
};

export type InstagramCommentEvent = {
  id: string;
  instagram_connection_id: string;
  automation_id: string | null;
  instagram_comment_id: string;
  instagram_media_id: string;
  commenter_id: string | null;
  comment_text: string | null;
  matched_keyword: string | null;
  comment_timestamp: string | null;
  processing_status: "pending" | "processing" | "sent" | "failed" | "ignored";
  attempt_count: number;
};

export class InstagramApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryable: boolean;

  constructor(status: number, code: string | null, message: string, retryable: boolean) {
    super(message);
    this.name = "InstagramApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export function isInstagramAuthorizationError(error: unknown): boolean {
  return error instanceof InstagramApiError &&
    (error.status === 401 || error.status === 403 || error.code === "190");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getInstagramConfig(): InstagramConfig | null {
  const appId = process.env.META_INSTAGRAM_APP_ID?.trim();
  const appSecret = process.env.META_INSTAGRAM_APP_SECRET?.trim();
  const webhookVerifyToken = process.env.META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN?.trim();
  const graphApiVersion = process.env.META_GRAPH_API_VERSION?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!appId || !appSecret || !webhookVerifyToken || !graphApiVersion || !siteUrl) return null;
  if (!/^v\d+\.\d+$/.test(graphApiVersion)) return null;
  return {
    appId,
    appSecret,
    webhookVerifyToken,
    graphApiVersion,
    redirectUri: `${siteUrl}/api/instagram/callback`,
  };
}

function encryptionKey(): Buffer {
  const encoded = process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Instagram token encryption is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("INSTAGRAM_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptInstagramToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptInstagramToken(value: string): string {
  const [ivValue, tagValue, encryptedValue, extra] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue || extra !== undefined) {
    throw new Error("Stored Instagram token ciphertext is malformed.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function oauthStateSignature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`instagram-oauth:${payload}`).digest();
}

export function createInstagramOAuthState(
  creatorId: string,
  now = Date.now(),
): { state: string; cookieValue: string } {
  const config = getInstagramConfig();
  if (!config) throw new Error("Instagram OAuth is not configured.");
  const state = randomBytes(32).toString("base64url");
  const payload = `${creatorId}.${now}.${state}`;
  const signature = oauthStateSignature(payload, config.appSecret).toString("base64url");
  return { state, cookieValue: `${payload}.${signature}` };
}

export function verifyInstagramOAuthState(
  state: string | null,
  cookieValue: string | undefined,
  creatorId: string,
  now = Date.now(),
): boolean {
  const config = getInstagramConfig();
  if (!config || !state || !cookieValue) return false;
  const [cookieCreatorId, timestampText, cookieState, signatureText, extra] = cookieValue.split(".");
  if (
    !cookieCreatorId ||
    !timestampText ||
    !cookieState ||
    !signatureText ||
    extra !== undefined ||
    cookieCreatorId !== creatorId ||
    cookieState !== state ||
    !/^\d{13}$/.test(timestampText)
  ) return false;
  const issuedAt = Number(timestampText);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now + 60_000 || now - issuedAt > OAUTH_STATE_MAX_AGE_MS) {
    return false;
  }
  const expected = oauthStateSignature(`${cookieCreatorId}.${timestampText}.${cookieState}`, config.appSecret);
  const actual = Buffer.from(signatureText, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function verifyInstagramWebhookSignature(
  body: string,
  signatureHeader: string | null,
  appSecret = getInstagramConfig()?.appSecret,
): boolean {
  if (!appSecret || !signatureHeader || !/^sha256=[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = createHmac("sha256", appSecret).update(body).digest();
  const actual = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function parseInstagramCommentNotifications(value: unknown): Array<{
  instagramUserId: string;
  commentId: string;
  mediaId: string;
  commenterId: string | null;
  text: string | null;
  timestamp: string | null;
}> {
  if (!isRecord(value) || value.object !== "instagram" || !Array.isArray(value.entry)) return [];
  const comments: Array<{
    instagramUserId: string;
    commentId: string;
    mediaId: string;
    commenterId: string | null;
    text: string | null;
    timestamp: string | null;
  }> = [];
  for (const entry of value.entry) {
    if (!isRecord(entry) || typeof entry.id !== "string") continue;
    const changes = Array.isArray(entry.changes) ? entry.changes : [entry];
    for (const change of changes) {
      if (!isRecord(change) || change.field !== "comments" || !isRecord(change.value)) continue;
      const event = change.value;
      const mediaId = typeof event.media_id === "string"
        ? event.media_id
        : isRecord(event.media) && typeof event.media.id === "string"
          ? event.media.id
          : null;
      const timestampValue = event.timestamp;
      let timestamp: string | null = null;
      if (typeof timestampValue === "string") {
        const numeric = Number(timestampValue);
        const parsed = Number.isFinite(numeric)
          ? numeric < 10_000_000_000 ? numeric * 1000 : numeric
          : Date.parse(timestampValue);
        if (Number.isFinite(parsed) && parsed > 0) timestamp = new Date(parsed).toISOString();
      } else if (typeof timestampValue === "number" && Number.isFinite(timestampValue) && timestampValue > 0) {
        timestamp = new Date(timestampValue < 10_000_000_000 ? timestampValue * 1000 : timestampValue).toISOString();
      }
      if (typeof event.id !== "string" || !mediaId) continue;
      comments.push({
        instagramUserId: entry.id,
        commentId: event.id,
        mediaId,
        commenterId: isRecord(event.from) && typeof event.from.id === "string" ? event.from.id : null,
        text: typeof event.text === "string" ? event.text.slice(0, 2200) : null,
        timestamp,
      });
    }
  }
  return comments;
}

export function getMatchedInstagramKeyword(
  comment: string,
  keywords: string[],
  matchType: "whole_word" | "exact_comment",
): string | null {
  const normalizedComment = comment.normalize("NFKC").trim().toLowerCase();
  for (const rawKeyword of keywords) {
    const keyword = rawKeyword.normalize("NFKC").trim().toLowerCase();
    if (!keyword) continue;
    if (matchType === "exact_comment") {
      if (normalizedComment === keyword) return rawKeyword;
      continue;
    }
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, "iu");
    if (pattern.test(normalizedComment)) return rawKeyword;
  }
  return null;
}

export function selectMatchingInstagramAutomation<
  T extends {
    created_at: string;
    id: string;
    status: string;
    trigger_keywords: string[];
    match_type: "whole_word" | "exact_comment";
  },
>(comment: string, automations: T[]): { automation: T; keyword: string } | null {
  const ordered = [...automations].sort((first, second) =>
    first.created_at.localeCompare(second.created_at) || first.id.localeCompare(second.id),
  );
  for (const automation of ordered) {
    if (automation.status !== "active") continue;
    const keyword = getMatchedInstagramKeyword(comment, automation.trigger_keywords, automation.match_type);
    if (keyword) return { automation, keyword };
  }
  return null;
}

export function isInstagramCommentEligible(
  timestamp: string,
  now = Date.now(),
): boolean {
  const createdAt = Date.parse(timestamp);
  return Number.isFinite(createdAt) && createdAt <= now + 60_000 && now - createdAt <= 7 * 24 * 60 * 60 * 1000;
}

function graphUrl(path: string): URL {
  const config = getInstagramConfig();
  if (!config) throw new Error("Instagram API is not configured.");
  return new URL(`${config.graphApiVersion}/${path.replace(/^\/+/, "")}`, "https://graph.instagram.com/");
}

async function metaRequest(
  url: URL,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    const deliveryOutcomeUnknown = url.pathname.endsWith("/messages");
    throw new InstagramApiError(
      503,
      deliveryOutcomeUnknown ? "delivery_status_unknown" : "network_error",
      deliveryOutcomeUnknown
        ? "Instagram's reply delivery could not be confirmed; it will not be retried to avoid sending a duplicate."
        : "Could not reach Instagram. The operation can be retried.",
      !deliveryOutcomeUnknown,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || !isRecord(payload)) {
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
    const code = error && (typeof error.code === "string" || typeof error.code === "number")
      ? String(error.code)
      : null;
    const message = error && typeof error.message === "string"
      ? error.message.slice(0, 300)
      : "Instagram returned an invalid response.";
    const retryable = response.status === 429 ||
      response.status >= 500 ||
      error?.is_transient === true ||
      (code !== null && ["2", "4", "17", "32", "613"].includes(code));
    throw new InstagramApiError(response.status, code, message, retryable);
  }
  return payload;
}

export async function exchangeInstagramAuthorizationCode(
  code: string,
  config: InstagramConfig,
): Promise<{ shortLivedToken: string; userId: string; grantedScopes: string[] }> {
  const form = new FormData();
  form.set("client_id", config.appId);
  form.set("client_secret", config.appSecret);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", config.redirectUri);
  form.set("code", code);
  const response = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (
    !response.ok ||
    !isRecord(payload) ||
    typeof payload.access_token !== "string" ||
    (typeof payload.user_id !== "string" && typeof payload.user_id !== "number")
  ) {
    throw new InstagramApiError(response.status, null, "Instagram authorization could not be exchanged.", response.status >= 500);
  }
  const granted = typeof payload.permissions === "string"
    ? payload.permissions.split(",")
    : Array.isArray(payload.permissions)
      ? payload.permissions.filter((permission): permission is string => typeof permission === "string")
      : [];
  return {
    shortLivedToken: payload.access_token,
    userId: String(payload.user_id),
    grantedScopes: granted.map((scope) => scope.trim()).filter(Boolean),
  };
}

export async function exchangeForLongLivedInstagramToken(
  shortLivedToken: string,
  config: InstagramConfig,
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL("access_token", "https://graph.instagram.com/");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("access_token", shortLivedToken);
  const payload = await metaRequest(url);
  if (typeof payload.access_token !== "string" || typeof payload.expires_in !== "number") {
    throw new InstagramApiError(502, null, "Instagram returned an invalid long-lived token.", false);
  }
  return { accessToken: payload.access_token, expiresIn: payload.expires_in };
}

export async function refreshInstagramAccessToken(
  accessToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL("refresh_access_token", "https://graph.instagram.com/");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  const payload = await metaRequest(url);
  if (typeof payload.access_token !== "string" || typeof payload.expires_in !== "number") {
    throw new InstagramApiError(502, null, "Instagram returned an invalid refreshed token.", false);
  }
  return { accessToken: payload.access_token, expiresIn: payload.expires_in };
}

export async function getInstagramProfile(accessToken: string): Promise<{
  userId: string;
  username: string;
  accountType: string | null;
}> {
  const url = graphUrl("me");
  url.searchParams.set("fields", "user_id,username,account_type");
  const payload = await metaRequest(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const userId = typeof payload.user_id === "string" || typeof payload.user_id === "number"
    ? String(payload.user_id)
    : null;
  if (!userId || typeof payload.username !== "string") {
    throw new InstagramApiError(502, null, "Instagram did not return a professional account profile.", false);
  }
  return {
    userId,
    username: payload.username,
    accountType: typeof payload.account_type === "string" ? payload.account_type : null,
  };
}

export async function subscribeInstagramComments(
  instagramUserId: string,
  accessToken: string,
): Promise<void> {
  const url = graphUrl(`${encodeURIComponent(instagramUserId)}/subscribed_apps`);
  url.searchParams.set("subscribed_fields", "comments");
  await metaRequest(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function unsubscribeInstagramComments(
  instagramUserId: string,
  accessToken: string,
): Promise<void> {
  const url = graphUrl(`${encodeURIComponent(instagramUserId)}/subscribed_apps`);
  await metaRequest(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function getInstagramMedia(
  instagramUserId: string,
  accessToken: string,
): Promise<InstagramMedia[]> {
  const media: InstagramMedia[] = [];
  let nextUrl: URL | null = graphUrl(`${encodeURIComponent(instagramUserId)}/media`);
  nextUrl.searchParams.set("fields", "id,media_type,media_product_type,permalink,caption,timestamp");
  nextUrl.searchParams.set("limit", "100");
  for (let page = 0; nextUrl && page < 5; page += 1) {
    const payload = await metaRequest(nextUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (Array.isArray(payload.data)) {
      for (const item of payload.data) {
        if (
          isRecord(item) &&
          typeof item.id === "string" &&
          (item.media_type === "IMAGE" || item.media_type === "VIDEO" || item.media_type === "CAROUSEL_ALBUM") &&
          (item.media_product_type === "FEED" || item.media_product_type === "REELS") &&
          typeof item.permalink === "string" &&
          typeof item.timestamp === "string"
        ) {
          media.push({
            id: item.id,
            media_type: item.media_type,
            media_product_type: item.media_product_type,
            permalink: item.permalink,
            caption: typeof item.caption === "string" ? item.caption.slice(0, 2200) : "",
            timestamp: item.timestamp,
          });
        }
      }
    }
    nextUrl = null;
    if (isRecord(payload.paging) && typeof payload.paging.next === "string") {
      try {
        const candidate = new URL(payload.paging.next);
        if (candidate.origin === "https://graph.instagram.com") nextUrl = candidate;
      } catch {
        nextUrl = null;
      }
    }
  }
  return media;
}

export async function getInstagramCommentDetails(
  commentId: string,
  accessToken: string,
): Promise<{ timestamp: string; text: string | null; commenterId: string | null }> {
  const url = graphUrl(encodeURIComponent(commentId));
  url.searchParams.set("fields", "timestamp,text,from");
  const payload = await metaRequest(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (typeof payload.timestamp !== "string" || !Number.isFinite(Date.parse(payload.timestamp))) {
    throw new InstagramApiError(422, "comment_timestamp_unavailable", "Instagram did not provide the comment creation time.", false);
  }
  return {
    timestamp: new Date(payload.timestamp).toISOString(),
    text: typeof payload.text === "string" ? payload.text.slice(0, 2200) : null,
    commenterId: isRecord(payload.from) && typeof payload.from.id === "string" ? payload.from.id : null,
  };
}

export async function sendInstagramPrivateReply(
  instagramUserId: string,
  commentId: string,
  accessToken: string,
  message: string,
): Promise<string> {
  const text = message.trim();
  if (!text || [...text].length > INSTAGRAM_REPLY_MAX_LENGTH) {
    throw new InstagramApiError(400, "invalid_message", "The private reply must be 1–1,000 characters.", false);
  }
  const url = graphUrl(`${encodeURIComponent(instagramUserId)}/messages`);
  const payload = await metaRequest(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text },
    }),
  });
  if (typeof payload.message_id !== "string") {
    throw new InstagramApiError(502, null, "Instagram did not confirm the private reply.", false);
  }
  return payload.message_id;
}
