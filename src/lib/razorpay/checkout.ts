import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptRazorpayToken } from "@/lib/razorpay/oauth";

const RAZORPAY_API_BASE = "https://api.razorpay.com";

export type RazorpayCheckoutConnection = {
  creatorId: string;
  accountId: string;
  environment: "test" | "live";
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
      environment: "test",
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
      const details = await readRazorpayError(response, [accessToken]);
      console.error("Razorpay API request failed.", {
        path,
        status: response.status,
        razorpayError: details,
      });
      throw new RazorpayApiError(response.status, details);
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
  constructor(
    readonly status: number,
    readonly details: SanitizedRazorpayError = {},
  ) {
    super("Razorpay API request failed.");
    this.name = "RazorpayApiError";
  }
}

type SanitizedRazorpayError = {
  code?: string;
  description?: string;
  field?: string;
  source?: string;
  reason?: string;
};

async function readRazorpayError(
  response: Response,
  knownSecrets: string[] = [],
): Promise<SanitizedRazorpayError> {
  const responseText = await response.text().catch(() => "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== "object" || !("error" in parsed)) return {};
  const error = (parsed as { error?: unknown }).error;
  if (!error || typeof error !== "object") return {};

  const fields: Array<keyof SanitizedRazorpayError> = [
    "code",
    "description",
    "field",
    "source",
    "reason",
  ];
  const result: SanitizedRazorpayError = {};
  for (const field of fields) {
    const value = (error as Record<string, unknown>)[field];
    if (typeof value !== "string") continue;
    result[field] = sanitizeRazorpayErrorField(value, knownSecrets);
  }
  return result;
}

function sanitizeRazorpayErrorField(value: string, knownSecrets: string[] = []): string {
  const sanitized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|webhook[_ -]?secret|encryption[_ -]?key)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]",
    )
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .slice(0, 300);
  return redactKnownSecrets(sanitized, knownSecrets);
}

type RazorpayWebhookEntity = {
  id?: string;
  owner_id?: string;
  url?: string;
  active?: boolean;
  secret_exists?: boolean;
  events?: string[];
};

const RAZORPAY_ACCOUNT_WEBHOOK_EVENTS = [
  "payment.authorized",
  "payment.failed",
  "payment.captured",
  "order.paid",
] as const;

function matchesRazorpayWebhook(
  webhook: RazorpayWebhookEntity,
  accountId: string,
  url: string,
): boolean {
  const ownerId = webhook.owner_id;
  const normalizedAccountId = accountId.replace(/^acc_/, "");
  return (
    webhook.active === true &&
    webhook.secret_exists === true &&
    (ownerId === accountId || ownerId === normalizedAccountId) &&
    webhook.url === url &&
    RAZORPAY_ACCOUNT_WEBHOOK_EVENTS.every((event) =>
      webhook.events?.includes(event),
    )
  );
}

function logWebhookRegistrationError(
  error: unknown,
  connection: RazorpayCheckoutConnection,
  path: string,
  operation: "fetch" | "create" | "update",
): void {
  const details = error instanceof RazorpayApiError ? error.details : {};
  console.error("Razorpay account webhook registration failed.", {
    endpointPath: path,
    httpStatus: error instanceof RazorpayApiError ? error.status : 0,
    environment: connection.environment,
    creatorId: connection.creatorId,
    accountId: connection.accountId,
    operation,
    razorpayError: details,
  });
}

async function persistRazorpayWebhookRegistration(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  connection: RazorpayCheckoutConnection,
  webhookId: string,
  webhookUrl: string,
  signingSecretHash: string,
): Promise<boolean> {
  const { error } = await admin
    .from("razorpay_checkout_webhooks")
    .upsert(
      {
        creator_id: connection.creatorId,
        razorpay_account_id: connection.accountId,
        environment: connection.environment,
        razorpay_webhook_id: webhookId,
        webhook_url: webhookUrl,
        signing_secret_hash: signingSecretHash,
        events: [...RAZORPAY_ACCOUNT_WEBHOOK_EVENTS],
      },
      { onConflict: "creator_id,razorpay_account_id,environment" },
    );

  if (error) {
    console.error("Razorpay webhook registration could not be saved.", {
      environment: connection.environment,
      creatorId: connection.creatorId,
      accountId: connection.accountId,
    });
    return false;
  }
  return true;
}

export async function ensureRazorpayAccountWebhook(
  connection: RazorpayCheckoutConnection,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const secret = getRazorpayTestWebhookSecret();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (
    !admin ||
    !secret ||
    !siteUrl ||
    !/^acc_[A-Za-z0-9]+$/.test(connection.accountId) ||
    connection.environment !== "test" ||
    process.env.RAZORPAY_OAUTH_MODE !== "test"
  ) {
    return false;
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(siteUrl);
  } catch {
    return false;
  }
  if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password) {
    return false;
  }

  const webhookUrl = new URL("/api/webhooks/razorpay", baseUrl).toString();
  if (webhookUrl.length > 255) return false;

  const signingSecretHash = createHash("sha256").update(secret).digest("hex");

  const lockId = randomUUID();
  const { data: lockClaimed, error: lockError } = await admin.rpc(
    "claim_razorpay_webhook_registration",
    {
      p_creator_id: connection.creatorId,
      p_account_id: connection.accountId,
      p_environment: connection.environment,
      p_lock_id: lockId,
    },
  );
  if (lockError) {
    console.error("Razorpay webhook registration lock could not be acquired.", {
      environment: connection.environment,
      creatorId: connection.creatorId,
      accountId: connection.accountId,
    });
    return false;
  }
  if (lockClaimed !== true) return false;

  try {
    const { data: existing, error: existingError } = await admin
      .from("razorpay_checkout_webhooks")
      .select("razorpay_webhook_id,webhook_url,signing_secret_hash")
      .eq("creator_id", connection.creatorId)
      .eq("razorpay_account_id", connection.accountId)
      .eq("environment", connection.environment)
      .maybeSingle();

    if (existingError) {
      console.error("Razorpay webhook registration could not be checked.", {
        environment: connection.environment,
        creatorId: connection.creatorId,
        accountId: connection.accountId,
      });
      return false;
    }

    const accountPath = `/v2/accounts/${encodeURIComponent(connection.accountId)}/webhooks`;
    if (existing?.razorpay_webhook_id) {
      if (
        existing.signing_secret_hash &&
        existing.signing_secret_hash !== signingSecretHash
      ) {
        console.error("Razorpay webhook signing secret changed; the account webhook must be recreated.", {
          environment: connection.environment,
          creatorId: connection.creatorId,
          accountId: connection.accountId,
          operation: "validate",
        });
        return false;
      }

      const webhookId = existing.razorpay_webhook_id as string;
      const webhookPath = `${accountPath}/${encodeURIComponent(webhookId)}`;
      let existingRemote: RazorpayWebhookEntity;
      try {
        existingRemote = await razorpayPartnerApiRequest<RazorpayWebhookEntity>(
          connection,
          webhookPath,
          { method: "GET" },
          "fetch",
          secret,
        );
      } catch {
        return false;
      }

      if (matchesRazorpayWebhook(existingRemote, connection.accountId, webhookUrl)) {
        return persistRazorpayWebhookRegistration(
          admin,
          connection,
          webhookId,
          webhookUrl,
          signingSecretHash,
        );
      }

      const ownerId = existingRemote.owner_id;
      if (
        ownerId !== connection.accountId &&
        ownerId !== connection.accountId.replace(/^acc_/, "")
      ) {
        console.error("Stored Razorpay webhook belongs to a different account.", {
          endpointPath: webhookPath,
          environment: connection.environment,
          creatorId: connection.creatorId,
          accountId: connection.accountId,
          operation: "validate",
        });
        return false;
      }

      if (existingRemote.active !== true || existingRemote.secret_exists !== true) {
        console.error("Existing Razorpay account webhook is inactive or has no signing secret.", {
          endpointPath: webhookPath,
          environment: connection.environment,
          creatorId: connection.creatorId,
          accountId: connection.accountId,
          operation: "validate",
        });
        return false;
      }

      let updated: RazorpayWebhookEntity;
      try {
        updated = await razorpayPartnerApiRequest<RazorpayWebhookEntity>(
          connection,
          webhookPath,
          {
            method: "PATCH",
            body: JSON.stringify({
              url: webhookUrl,
              events: [...RAZORPAY_ACCOUNT_WEBHOOK_EVENTS],
            }),
          },
          "update",
          secret,
        );
      } catch {
        return false;
      }

      if (!matchesRazorpayWebhook(updated, connection.accountId, webhookUrl)) {
        console.error("Razorpay webhook update returned an unexpected configuration.", {
          endpointPath: webhookPath,
          environment: connection.environment,
          creatorId: connection.creatorId,
          accountId: connection.accountId,
          operation: "update",
        });
        return false;
      }

      return persistRazorpayWebhookRegistration(
        admin,
        connection,
        webhookId,
        webhookUrl,
        signingSecretHash,
      );
    }

    let remoteWebhooks: { items?: RazorpayWebhookEntity[] };
    try {
      remoteWebhooks = await razorpayPartnerApiRequest<{
        items?: RazorpayWebhookEntity[];
      }>(
        connection,
        accountPath,
        { method: "GET" },
        "fetch",
        secret,
      );
    } catch {
      return false;
    }

    const matchingRemote = remoteWebhooks.items?.find(
      (webhook) =>
        webhook.url === webhookUrl &&
        (webhook.owner_id === connection.accountId ||
          webhook.owner_id === connection.accountId.replace(/^acc_/, "")) &&
        webhook.secret_exists === true,
    );
    if (matchingRemote?.id) {
      let existingRemote = matchingRemote;
      if (!matchesRazorpayWebhook(matchingRemote, connection.accountId, webhookUrl)) {
        try {
          existingRemote = await razorpayPartnerApiRequest<RazorpayWebhookEntity>(
            connection,
            `${accountPath}/${encodeURIComponent(matchingRemote.id)}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                url: webhookUrl,
                events: [...RAZORPAY_ACCOUNT_WEBHOOK_EVENTS],
              }),
            },
            "update",
            secret,
          );
        } catch {
          return false;
        }
      }

      if (!matchesRazorpayWebhook(existingRemote, connection.accountId, webhookUrl)) {
        console.error("Existing Razorpay account webhook could not be reconciled.", {
          endpointPath: accountPath,
          environment: connection.environment,
          creatorId: connection.creatorId,
          accountId: connection.accountId,
          operation: "update",
        });
        return false;
      }

      return persistRazorpayWebhookRegistration(
        admin,
        connection,
        existingRemote.id ?? matchingRemote.id,
        webhookUrl,
        signingSecretHash,
      );
    }

    const createPath = accountPath;
    let created: RazorpayWebhookEntity;
    try {
      created = await razorpayPartnerApiRequest<RazorpayWebhookEntity>(
        connection,
        createPath,
        {
          method: "POST",
          body: JSON.stringify({
            url: webhookUrl,
            secret,
            events: [...RAZORPAY_ACCOUNT_WEBHOOK_EVENTS],
          }),
        },
        "create",
        secret,
      );
    } catch {
      return false;
    }

    if (
      !created.id ||
      !matchesRazorpayWebhook(created, connection.accountId, webhookUrl)
    ) {
      console.error("Razorpay webhook registration returned an unexpected response.", {
        endpointPath: createPath,
        environment: connection.environment,
        creatorId: connection.creatorId,
        accountId: connection.accountId,
        operation: "create",
      });
      return false;
    }

    return persistRazorpayWebhookRegistration(
      admin,
      connection,
      created.id,
      webhookUrl,
      signingSecretHash,
    );
  } finally {
    const { error: releaseError } = await admin.rpc(
      "release_razorpay_webhook_registration",
      {
        p_creator_id: connection.creatorId,
        p_account_id: connection.accountId,
        p_environment: connection.environment,
        p_lock_id: lockId,
      },
    );
    if (releaseError) {
      console.error("Razorpay webhook registration lock could not be released.", {
        environment: connection.environment,
        creatorId: connection.creatorId,
        accountId: connection.accountId,
      });
    }
  }
}

async function razorpayPartnerApiRequest<T>(
  connection: RazorpayCheckoutConnection,
  path: string,
  init: RequestInit,
  operation: "fetch" | "create" | "update",
  webhookSecret: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${RAZORPAY_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${Buffer.from(`${connection.accessToken}:`).toString("base64")}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      const details = await readRazorpayError(response);
      for (const field of Object.keys(details) as Array<keyof SanitizedRazorpayError>) {
        const value = details[field];
        if (value) {
          details[field] = sanitizeRazorpayErrorField(value, [
            connection.accessToken,
            webhookSecret,
          ]);
        }
      }
      const error = new RazorpayApiError(response.status, details);
      logWebhookRegistrationError(error, connection, path, operation);
      throw error;
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof RazorpayApiError) throw error;
    logWebhookRegistrationError(error, connection, path, operation);
    throw new RazorpayApiError(0);
  } finally {
    clearTimeout(timeout);
  }
}

function redactKnownSecrets(value: string, secrets: string[]): string {
  return secrets.reduce(
    (result, secret) =>
      secret ? result.replaceAll(secret, "[REDACTED]") : result,
    value,
  );
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
