import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_WEBHOOK_AGE_SECONDS = 300;

export function verifyResendWebhookSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  const encodedSecret = secret.trim().replace(/^whsec_/, "");
  if (
    !id ||
    id.length > 200 ||
    !timestamp ||
    !/^\d{1,12}$/.test(timestamp) ||
    !signatures ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedSecret)
  ) return false;

  const timestampSeconds = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > MAX_WEBHOOK_AGE_SECONDS
  ) return false;

  const key = Buffer.from(encodedSecret, "base64");
  if (!key.length) return false;
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  return signatures.split(/\s+/).some((entry) => {
    const [version, signature] = entry.split(",", 2);
    if (version !== "v1" || !signature || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) {
      return false;
    }
    const expectedBytes = Buffer.from(expected);
    const providedBytes = Buffer.from(signature);
    return expectedBytes.length === providedBytes.length &&
      timingSafeEqual(expectedBytes, providedBytes);
  });
}
