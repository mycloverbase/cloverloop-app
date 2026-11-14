import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  getFreeProductDeliveryConfig: vi.fn(),
  getRazorpayCheckoutConnection: vi.fn(),
  getRazorpayPartnerTestWebhookSecret: vi.fn(),
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
  getRazorpayPartnerTestWebhookSecret: mocks.getRazorpayPartnerTestWebhookSecret,
  getRazorpayTestWebhookSecret: mocks.getRazorpayTestWebhookSecret,
  razorpayApiRequest: mocks.razorpayApiRequest,
  verifyRazorpayWebhookSignature: mocks.verifyRazorpayWebhookSignature,
}));

import { POST } from "@/app/api/webhooks/razorpay/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RAZORPAY_OAUTH_MODE", "test");
  mocks.getRazorpayPartnerTestWebhookSecret.mockReturnValue(null);
  mocks.getRazorpayTestWebhookSecret.mockReturnValue("server-webhook-secret");
  mocks.verifyRazorpayWebhookSignature.mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/razorpay", () => {
  it("logs verified partner application events without touching payment records", async () => {
    const admin = { from: vi.fn(), rpc: vi.fn() };
    const diagnosticLog = vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.getRazorpayPartnerTestWebhookSecret.mockReturnValue("partner-webhook-secret");
    mocks.verifyRazorpayWebhookSignature.mockImplementation(
      (_body: string, signature: string | null, secret: string) =>
        signature === "partner-signature" && secret === "partner-webhook-secret",
    );

    const response = await POST(
      new Request("https://cloverloop.test/api/webhooks/razorpay", {
        method: "POST",
        headers: { "x-razorpay-signature": "partner-signature" },
        body: JSON.stringify({
          event: "payment.captured",
          account_id: "acc_ABC123",
          payload: {
            payment: {
              entity: {
                id: "pay_TEST123",
                order_id: "order_TEST123",
                email: "buyer@example.test",
              },
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyRazorpayWebhookSignature).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      "partner-signature",
      "server-webhook-secret",
    );
    expect(mocks.verifyRazorpayWebhookSignature).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      "partner-signature",
      "partner-webhook-secret",
    );
    expect(diagnosticLog).toHaveBeenCalledWith(
      "Razorpay application-level Test Mode webhook diagnostic.",
      {
        eventType: "payment.captured",
        accountId: "acc_ABC123",
        paymentId: "pay_TEST123",
        orderId: "order_TEST123",
        signatureVerified: true,
      },
    );
    expect(JSON.stringify(diagnosticLog.mock.calls)).not.toContain("buyer@example.test");
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(mocks.razorpayApiRequest).not.toHaveBeenCalled();
  });

  it("rejects invalid partner signatures without processing or logging payload data", async () => {
    const admin = { from: vi.fn(), rpc: vi.fn() };
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.getRazorpayPartnerTestWebhookSecret.mockReturnValue("partner-webhook-secret");

    const response = await POST(
      new Request("https://cloverloop.test/api/webhooks/razorpay", {
        method: "POST",
        headers: { "x-razorpay-signature": "invalid-signature" },
        body: JSON.stringify({
          event: "payment.captured",
          account_id: "acc_ABC123",
          payload: { payment: { entity: { id: "pay_TEST123" } } },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(warning).toHaveBeenCalledWith(
      "Razorpay webhook signature verification failed.",
      {
        eventType: "payment.captured",
        accountId: "acc_ABC123",
        paymentId: "pay_TEST123",
        orderId: null,
        signatureVerified: false,
      },
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain("buyer@example.test");
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("logs missing account_id as null for a verified partner diagnostic event", async () => {
    const admin = { from: vi.fn(), rpc: vi.fn() };
    const diagnosticLog = vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.getRazorpayPartnerTestWebhookSecret.mockReturnValue("partner-webhook-secret");
    mocks.verifyRazorpayWebhookSignature.mockImplementation(
      (_body: string, _signature: string | null, secret: string) =>
        secret === "partner-webhook-secret",
    );

    const response = await POST(
      new Request("https://cloverloop.test/api/webhooks/razorpay", {
        method: "POST",
        headers: { "x-razorpay-signature": "valid-partner-signature" },
        body: JSON.stringify({
          event: "payment.captured",
          payload: {
            payment: {
              entity: { id: "pay_TEST123", order_id: "order_TEST123" },
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(diagnosticLog).toHaveBeenCalledWith(
      "Razorpay application-level Test Mode webhook diagnostic.",
      {
        eventType: "payment.captured",
        accountId: null,
        paymentId: "pay_TEST123",
        orderId: "order_TEST123",
        signatureVerified: true,
      },
    );
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

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

  it("verifies and fulfills a captured payment once across duplicate webhook deliveries", async () => {
    const internalOrder = {
      id: "internal-order-a",
      creator_id: "creator-a",
      amount_paise: 29900,
      currency: "INR",
      razorpay_order_id: "order_test123",
    };
    let deliveryCount = 0;
    const admin = {
      from: vi.fn((table: string) => {
        let result: { data?: unknown; error: unknown } = { error: null };
        const query = {
          select: vi.fn(() => query),
          update: vi.fn(() => {
            result = { error: null };
            return query;
          }),
          insert: vi.fn(() => {
            deliveryCount += 1;
            result =
              deliveryCount === 1
                ? { error: null }
                : { error: { code: "23505" } };
            return query;
          }),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(() => {
            if (table === "razorpay_checkout_events") {
              result = {
                data: { processing_status: "processed" },
                error: null,
              };
            } else if (table === "razorpay_checkout_orders") {
              result = { data: internalOrder, error: null };
            } else if (table === "razorpay_checkout_webhooks") {
              result = {
                data: { razorpay_webhook_id: "HK890egfiItP3h" },
                error: null,
              };
            }
            return query;
          }),
          then: (resolve: (value: typeof result) => unknown) =>
            Promise.resolve(result).then(resolve),
        };
        return query;
      }),
      rpc: vi.fn().mockResolvedValue({
        data: [{ order_status: "paid", fulfillment_status: "ready" }],
        error: null,
      }),
    };
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.verifyRazorpayWebhookSignature.mockReturnValue(true);
    mocks.getFreeProductDeliveryConfig.mockReturnValue({
      maxDownloads: 3,
      expiryHours: 48,
    });
    mocks.getRazorpayCheckoutConnection.mockResolvedValue({
      creatorId: "creator-a",
      accountId: "acc_ABC123",
      environment: "test",
      publicToken: "rzp_test_public",
      accessToken: "server-only-access-token",
    });
    mocks.razorpayApiRequest.mockImplementation(
      async (_token: string, path: string) => {
        if (path.includes("/orders/")) {
          return {
            id: "order_test123",
            amount: 29900,
            currency: "INR",
            receipt: "internal-order-a",
          };
        }
        return {
          id: "pay_test123",
          order_id: "order_test123",
          amount: 29900,
          currency: "INR",
          status: "captured",
          captured: true,
          account_id: "acc_ABC123",
        };
      },
    );

    const makeRequest = () =>
      new Request("https://cloverloop.test/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "x-razorpay-signature": "a".repeat(64),
          "x-razorpay-event-id": "event_test123",
        },
        body: JSON.stringify({
          event: "payment.captured",
          account_id: "acc_ABC123",
          payload: {
            payment: {
              entity: {
                id: "pay_test123",
                order_id: "order_test123",
                account_id: "acc_ABC123",
              },
            },
          },
        }),
      });

    const firstResponse = await POST(makeRequest());
    const duplicateResponse = await POST(makeRequest());

    expect(firstResponse.status).toBe(200);
    expect(duplicateResponse.status).toBe(200);
    expect(mocks.verifyRazorpayWebhookSignature).toHaveBeenCalledTimes(2);
    expect(mocks.razorpayApiRequest).toHaveBeenCalledTimes(2);
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(admin.rpc).toHaveBeenCalledWith(
      "record_razorpay_checkout_payment",
      expect.objectContaining({
        p_order_id: "internal-order-a",
        p_payment_id: "pay_test123",
        p_amount_paise: 29900,
        p_currency: "INR",
        p_payment_status: "captured",
        p_captured: true,
      }),
    );
  });
});
