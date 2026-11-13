import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  getFreeProductDeliveryConfig: vi.fn(),
  getRazorpayCheckoutConnection: vi.fn(),
  getRazorpayTestWebhookSecret: vi.fn(),
  razorpayApiRequest: vi.fn(),
  verifyRazorpayWebhookSignature: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/razorpay/checkout", () => ({
  getFreeProductDeliveryConfig: mocks.getFreeProductDeliveryConfig,
  getRazorpayCheckoutConnection: mocks.getRazorpayCheckoutConnection,
  getRazorpayTestWebhookSecret: mocks.getRazorpayTestWebhookSecret,
  razorpayApiRequest: mocks.razorpayApiRequest,
  verifyRazorpayWebhookSignature: mocks.verifyRazorpayWebhookSignature,
}));

import { POST } from "@/app/api/webhooks/razorpay/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RAZORPAY_OAUTH_MODE", "test");
  mocks.getRazorpayTestWebhookSecret.mockReturnValue("server-webhook-secret");
  mocks.verifyRazorpayWebhookSignature.mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/razorpay", () => {
  it("rejects an invalid signature before reading or writing payment records", async () => {
    const admin = { from: vi.fn() };
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    const request = new Request("https://cloverloop.test/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": "0".repeat(64),
        "x-razorpay-event-id": "event_test123",
      },
      body: '{"event":"payment.captured"}',
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mocks.verifyRazorpayWebhookSignature).toHaveBeenCalledWith(
      '{"event":"payment.captured"}',
      "0".repeat(64),
      "server-webhook-secret",
    );
    expect(admin.from).not.toHaveBeenCalled();
    expect(mocks.razorpayApiRequest).not.toHaveBeenCalled();
  });
});
