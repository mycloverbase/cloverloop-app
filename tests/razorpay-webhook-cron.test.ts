import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  isRazorpayPartnerWebhookFulfillmentEnabled: vi.fn(),
  processRazorpayPartnerWebhookQueue: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/razorpay/checkout", () => ({
  isRazorpayPartnerWebhookFulfillmentEnabled:
    mocks.isRazorpayPartnerWebhookFulfillmentEnabled,
}));

vi.mock("@/lib/razorpay/webhook-fulfillment", () => ({
  processRazorpayPartnerWebhookQueue: mocks.processRazorpayPartnerWebhookQueue,
}));

import { GET } from "@/app/api/cron/razorpay-webhook-process/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "cron-secret");
  mocks.isRazorpayPartnerWebhookFulfillmentEnabled.mockReturnValue(true);
  mocks.createSupabaseAdminClient.mockReturnValue({ rpc: vi.fn() });
  mocks.processRazorpayPartnerWebhookQueue.mockResolvedValue({
    claimed: 2,
    processed: 1,
    ignored: 0,
    failed: 1,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/razorpay-webhook-process", () => {
  it("requires the CRON_SECRET bearer token", async () => {
    const response = await GET(
      new Request("https://cloverloop.test/api/cron/razorpay-webhook-process"),
    );

    expect(response.status).toBe(401);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("processes a bounded batch only when fulfillment is configured", async () => {
    const admin = mocks.createSupabaseAdminClient();
    const response = await GET(
      new Request("https://cloverloop.test/api/cron/razorpay-webhook-process", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      claimed: 2,
      processed: 1,
      ignored: 0,
      failed: 1,
    });
    expect(mocks.processRazorpayPartnerWebhookQueue).toHaveBeenCalledWith(
      admin,
      null,
      5,
    );
  });

  it("fails closed when the Test Mode application webhook is not configured", async () => {
    mocks.isRazorpayPartnerWebhookFulfillmentEnabled.mockReturnValue(false);
    const response = await GET(
      new Request("https://cloverloop.test/api/cron/razorpay-webhook-process", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(503);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});
