import "server-only";
import { createHash, createHmac } from "node:crypto";

export const REVIEW_TOKEN_TTL_DAYS = 60;

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

function reviewTokenSecret(): string | null {
  const secret = process.env.REVIEW_TOKEN_SECRET?.trim();
  return secret && Buffer.byteLength(secret) >= 32 ? secret : null;
}

export function isReviewTokenConfigured(): boolean {
  return Boolean(reviewTokenSecret());
}

export function isReviewTokenFormat(value: unknown): value is string {
  return typeof value === "string" && tokenPattern.test(value);
}

// Deterministic per invitation and delivery generation, so a retried send with the same
// Resend idempotency key always carries the token whose hash is stored.
export function createReviewToken(invitationId: string, deliveryGeneration: number): string | null {
  const secret = reviewTokenSecret();
  if (!secret || !Number.isSafeInteger(deliveryGeneration) || deliveryGeneration < 0) return null;
  return createHmac("sha256", secret)
    .update(`product-review.${invitationId}.${deliveryGeneration}`)
    .digest("base64url");
}

export function hashReviewToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
