import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptRazorpayToken } from "@/lib/razorpay/oauth";

const RAZORPAY_API_BASE = "https://api.razorpay.com";

export type RazorpayCheckoutConnection = {
  creatorId: string;
  accountId: string;
  publicToken: string;
  accessToken: string;
};

type StoredConnection = {
  creator_id: string;
  razorpay_account_id: string;
  client_id: string;
  environment: string;
  public_token: string | null;
  access_token_encrypted: string;
  token_expires_at: string | null;
  connection_status: string;
};

export function isRazorpayCheckoutEnabled(): boolean {
  return process.env.RAZORPAY_CHECKOUT_ENABLED === "true";
}

export function getRazorpayTestWebhookSecret(): string | null {
  return process.env.RAZORPAY_TEST_WEBHOOK_SECRET?.trim() || null;
}

export function hashCheckoutToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isValidCheckoutToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(token);
}

export function normalizeCustomerEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export async function getRazorpayCheckoutConnection(
  creatorId: string,
): Promise<RazorpayCheckoutConnection | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;

  const clientId = process.env.RAZORPAY_OAUTH_CLIENT_ID?.trim();
  if (
    process.env.RAZORPAY_OAUTH_ENABLED !== "true" ||
    process.env.RAZORPAY_OAUTH_MODE !== "test" ||
    !clientId
  ) {
    return null;
  }

  const { data, error } = await admin
    .from("creator_razorpay_connections")
    .select(
      "creator_id,razorpay_account_id,client_id,environment,public_token,access_token_encrypted,token_expires_at,connection_status",
    )
    .eq("creator_id", creatorId)
    .eq("environment", "test")
    .eq("connection_status", "connected")
    .maybeSingle();

  if (error) {
    console.error("Razorpay checkout connection could not be loaded.");
    return null;
  }
  if (!data) return null;

  const connection = data as StoredConnection;
  if (
    connection.creator_id !== creatorId ||
    connection.client_id !== clientId ||
    connection.environment !== "test" ||
    connection.connection_status !== "connected" ||
    !connection.razorpay_account_id ||
    !connection.public_token ||
    !connection.public_token.startsWith("rzp_test_") ||
    !connection.access_token_encrypted ||
    (connection.token_expires_at &&
      new Date(connection.token_expires_at).getTime() <= Date.now())
  ) {
    return null;
  }

  try {
    return {
      creatorId,
      accountId: connection.razorpay_account_id,
      publicToken: connection.public_token,
      accessToken: decryptRazorpayToken(
        connection.access_token_encrypted,
        creatorId,
        "access",
      ),
    };
  } catch {
    console.error("Razorpay checkout connection token could not be decrypted.");
    return null;
  }
}

export async function razorpayApiRequest<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(`${RAZORPAY_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("Razorpay API request failed.", {
        path,
        status: response.status,
      });
      throw new RazorpayApiError(response.status);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof RazorpayApiError) throw error;
    console.error("Razorpay API request could not be completed.", { path });
    throw new RazorpayApiError(0);
  } finally {
    clearTimeout(timeout);
  }
}

export class RazorpayApiError extends Error {
  constructor(readonly status: number) {
    super("Razorpay API request failed.");
    this.name = "RazorpayApiError";
  }
}

export async function ensureRazorpayAccountWebhook(
  connection: RazorpayCheckoutConnection,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const secret = getRazorpayTestWebhookSecret();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!admin || !secret || !siteUrl) return false;

  let baseUrl: URL;
  try {
    baseUrl = new URL(siteUrl);
  } catch {
    return false;
  }

  const webhookUrl = new URL("/api/webhooks/razorpay", baseUrl).toString();
  const { data: existing, error: existingError } = await admin
    .from("razorpay_checkout_webhooks")
    .select("id,razorpay_webhook_id,webhook_url")
    .eq("creator_id", connection.creatorId)
    .eq("razorpay_account_id", connection.accountId)
    .eq("environment", "test")
    .maybeSingle();

  if (existingError) {
    console.error("Razorpay webhook registration could not be checked.");
    return false;
  }
  if (existing?.webhook_url === webhookUrl) return true;

  let created: { id?: string };
  try {
    created = await razorpayApiRequest<{ id?: string }>(
      connection.accessToken,
      `/v2/accounts/${encodeURIComponent(connection.accountId)}/webhooks`,
      {
        method: "POST",
        body: JSON.stringify({
          url: webhookUrl,
          secret,
          events: [
            "payment.authorized",
            "payment.failed",
            "payment.captured",
            "order.paid",
          ],
        }),
      },
    );
  } catch {
    return false;
  }

  if (!created.id) {
    console.error("Razorpay webhook registration returned no identifier.");
    return false;
  }

  const { error: saveError } = await admin
    .from("razorpay_checkout_webhooks")
    .upsert(
      {
        creator_id: connection.creatorId,
        razorpay_account_id: connection.accountId,
        environment: "test",
        razorpay_webhook_id: created.id,
        webhook_url: webhookUrl,
      },
      { onConflict: "creator_id,razorpay_account_id,environment" },
    );

  if (saveError) {
    console.error("Razorpay webhook registration could not be saved.");
    return false;
  }

  return true;
}

export function getFreeProductDeliveryConfig(): {
  maxDownloads: number;
  expiryHours: number;
} | null {
  const maxDownloads = Number(process.env.FREE_PRODUCT_MAX_DOWNLOADS ?? 3);
  const expiryHours = Number(process.env.FREE_PRODUCT_LINK_EXPIRY_HOURS ?? 48);
  if (
    !Number.isInteger(maxDownloads) ||
    maxDownloads < 1 ||
    maxDownloads > 20 ||
    !Number.isInteger(expiryHours) ||
    expiryHours < 1 ||
    expiryHours > 168
  ) {
    return null;
  }

  return {
    maxDownloads,
    expiryHours,
  };
}

export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expectedHmac = createHmac("sha256", secret).update(rawBody).digest();
  const provided = Buffer.from(signature, "hex");
  return provided.length === expectedHmac.length &&
    timingSafeEqual(expectedHmac, provided);
}
