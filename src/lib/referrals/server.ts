import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const FOUNDER_REFERRAL_COOKIE = "cloverloop_founder_referral";
const REFERRAL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function referralSecret(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

function signTimestamp(timestamp: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`founder:${timestamp}`)
    .digest("hex");
}

export function createFounderReferralCookieValue(now = Date.now()): string | null {
  const secret = referralSecret();
  if (!secret) return null;
  const timestamp = String(now);
  return `${timestamp}.${signTimestamp(timestamp, secret)}`;
}

export function getFounderReferralIssuedAt(value: string | undefined, now = Date.now()): number | null {
  const secret = referralSecret();
  if (!secret || !value) return null;
  const [timestamp, signature, extra] = value.split(".");
  if (
    !timestamp ||
    !signature ||
    extra !== undefined ||
    !/^\d{13}$/.test(timestamp) ||
    !/^[0-9a-f]{64}$/.test(signature)
  ) return null;
  const issuedAt = Number(timestamp);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now + 5 * 60 * 1000) return null;
  if (now - issuedAt > REFERRAL_COOKIE_MAX_AGE_SECONDS * 1000) return null;
  const expected = Buffer.from(signTimestamp(timestamp, secret), "hex");
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? issuedAt : null;
}

export function verifyFounderReferralCookie(value: string | undefined): boolean {
  return getFounderReferralIssuedAt(value) !== null;
}
