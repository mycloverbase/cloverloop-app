import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_FREE_PRODUCT_LINK_EXPIRY_HOURS = 48;
export const DEFAULT_FREE_PRODUCT_MAX_DOWNLOADS = 3;
export const SIGNED_PRODUCT_URL_EXPIRY_SECONDS = 60;

export type FreeProductConfig = {
  linkExpiryHours: number;
  maxDownloads: number;
};

export function getFreeProductConfig(): FreeProductConfig | null {
  const linkExpiryHours = Number(process.env.FREE_PRODUCT_LINK_EXPIRY_HOURS ?? DEFAULT_FREE_PRODUCT_LINK_EXPIRY_HOURS);
  const maxDownloads = Number(process.env.FREE_PRODUCT_MAX_DOWNLOADS ?? DEFAULT_FREE_PRODUCT_MAX_DOWNLOADS);
  if (
    !Number.isInteger(linkExpiryHours) ||
    linkExpiryHours < 1 ||
    linkExpiryHours > 168 ||
    !Number.isInteger(maxDownloads) ||
    maxDownloads < 1 ||
    maxDownloads > 20
  ) {
    console.error("Free product link expiry or download limit configuration is invalid.");
    return null;
  }
  return { linkExpiryHours, maxDownloads };
}

export function normalizeCustomerEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > 254 ||
    /[\r\n\s]/.test(email) ||
    !/^[^@]+@[^@]+\.[^@]+$/.test(email)
  ) return null;
  return email;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function generateDownloadToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: createHash("sha256").update(token).digest("hex") };
}

export function hashDownloadToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashRateLimitKey(scope: string, value: string): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return createHmac("sha256", secret).update(`${scope}:${value}`).digest("hex");
}

export function getRequestIp(request: Request): string {
  const trustedIp = request.headers.get("x-real-ip")?.trim();
  if (trustedIp && trustedIp.length <= 64) return trustedIp;
  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedIp && forwardedIp.length <= 64 ? forwardedIp : "unknown";
}

export async function checkFreeProductRateLimit(
  supabase: SupabaseClient,
  limits: { key: string; maxRequests: number }[],
): Promise<boolean> {
  const keys = limits.map(({ key }) => hashRateLimitKey("free-product", key));
  if (keys.some((key) => key === null)) throw new Error("Free product rate limiting is not configured.");
  const { data, error } = await supabase.rpc("check_free_product_rate_limit", {
    requested_keys: keys,
    requested_limits: limits.map(({ maxRequests }) => maxRequests),
    requested_window_seconds: 3600,
  });
  if (error) {
    console.error("Could not check the free product rate limit.", error);
    throw new Error("Free product rate limiting is temporarily unavailable.");
  }
  return data === true;
}

export function noStoreHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
  };
}
