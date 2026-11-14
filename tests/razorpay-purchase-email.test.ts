import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { POST as resendWebhook } from "@/app/api/webhooks/resend/route";
import {
  createPurchaseDownloadTicket,
  processRazorpayPurchaseEmailQueue,
  verifyPurchaseDownloadTicket,
} from "@/lib/razorpay/purchase-email";
import { verifyResendWebhookSignature } from "@/lib/resend/webhook-signature";

const orderId = "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e";
const deliveryExpiry = "2099-01-01T00:00:00.000Z";
const job = {
  order_id: orderId,
  delivery_generation: 0,
  customer_email: "buyer@example.com",
  customer_name: "Test Buyer",
  product_name: "Creator Guide",
  storefront_name: "Test Creator",
  amount_paise: 29900,
  currency: "INR",
  razorpay_order_id: "order_test123",
  expires_at: deliveryExpiry,
  max_downloads: 3,
};

function makeWebhookHeaders(rawBody: string, timestamp: number, signingSecret: string) {
  const id = "msg_test123";
  const secret = Buffer.from(signingSecret.replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return new Headers({
    "svix-id": id,
    "svix-timestamp": String(timestamp),
    "svix-signature": `v1,${signature}`,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PURCHASE_DOWNLOAD_LINK_SECRET", "test-purchase-link-secret-that-is-long-enough");
  vi.stubEnv("RESEND_API_KEY", "test-resend-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "CloverLoop <hello@example.com>");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "test-resend-webhook-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("purchase download email tickets", () => {
  it("signs a non-expired order ticket and rejects tampering or expiry", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const signature = createPurchaseDownloadTicket(orderId, expiresAt);
    expect(signature).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(verifyPurchaseDownloadTicket(orderId, expiresAt, signature!)).toBe(true);
    expect(verifyPurchaseDownloadTicket(orderId, expiresAt, `${signature}x`)).toBe(false);
    expect(verifyPurchaseDownloadTicket(orderId, expiresAt, signature!, expiresAt)).toBe(false);
  });

  it("sends a purchase email with a signed fragment link and provider idempotency key", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_razorpay_purchase_email_deliveries") {
        return { data: [job], error: null };
      }
      return { data: true, error: null };
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc });
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        to: string[];
        html: string;
        text: string;
        tags: { name: string; value: string }[];
      };
      expect(init?.headers).toMatchObject({
        "Idempotency-Key": `purchase-${orderId}-0`,
      });
      expect(body.to).toEqual(["buyer@example.com"]);
      expect(body.tags).toContainEqual({ name: "cloverloop_order_id", value: orderId });
      expect(body.html).toContain("Download Product");
      expect(body.html).toContain("expires on");
      expect(body.text).toContain("#orderId=");
      expect(body.text).not.toContain("access_token");
      return Response.json({ id: "email_test123" });
    });
    vi.stubGlobal("fetch", fetch);

    const result = await processRazorpayPurchaseEmailQueue({ rpc } as never);

    expect(result).toEqual({ claimed: 1, accepted: 1, failed: 0 });
    expect(rpc).toHaveBeenCalledWith(
      "finish_razorpay_purchase_email_delivery",
      expect.objectContaining({
        p_order_id: orderId,
        p_delivery_generation: 0,
        p_status: "accepted",
        p_provider_email_id: "email_test123",
      }),
    );
  });
});

describe("Resend webhook signature verification", () => {
  const now = 1_800_000_000;
  const secret = `whsec_${Buffer.from("resend-signing-secret").toString("base64")}`;

  it("verifies the raw body and rejects modifications and stale replays", () => {
    const rawBody = JSON.stringify({ type: "email.delivered", data: { email_id: "email_test123" } });
    const headers = makeWebhookHeaders(rawBody, now, secret);
    expect(verifyResendWebhookSignature(rawBody, headers, secret, now)).toBe(true);
    expect(verifyResendWebhookSignature(`${rawBody} `, headers, secret, now)).toBe(false);
    expect(verifyResendWebhookSignature(rawBody, headers, secret, now + 301)).toBe(false);
  });

  it("rejects a validly signed event when database persistence fails", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
    mocks.createSupabaseAdminClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "XX000" } }),
    });
    const rawBody = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "email_test123", tags: [{ name: "cloverloop_order_id", value: orderId }] },
    });
    const headers = makeWebhookHeaders(rawBody, Math.floor(Date.now() / 1000), secret);
    const response = await resendWebhook(new Request("https://cloverloop.test/api/webhooks/resend", {
      method: "POST",
      headers,
      body: rawBody,
    }));

    expect(response.status).toBe(503);
  });
});
