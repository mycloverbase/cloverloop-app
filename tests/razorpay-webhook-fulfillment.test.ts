import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFreeProductDeliveryConfig: vi.fn(),
  getRazorpayCheckoutConnection: vi.fn(),
  razorpayApiRequest: vi.fn(),
}));

vi.mock("@/lib/razorpay/checkout", () => ({
  getFreeProductDeliveryConfig: mocks.getFreeProductDeliveryConfig,
  getRazorpayCheckoutConnection: mocks.getRazorpayCheckoutConnection,
  RazorpayApiError: class RazorpayApiError extends Error {
    constructor(readonly status: number) {
      super("Razorpay API request failed.");
    }
  },
  razorpayApiRequest: mocks.razorpayApiRequest,
}));

import { processRazorpayPartnerWebhookQueue } from "@/lib/razorpay/webhook-fulfillment";

const order = {
  id: "internal-order-a",
  creator_id: "creator-a",
  amount_paise: 29900,
  currency: "INR",
  razorpay_order_id: "order_TEST123",
  order_status: "pending",
};

const claim = {
  event_id: "event_TEST123",
  creator_id: "creator-a",
  razorpay_account_id: "acc_A123",
  razorpay_order_id: "order_TEST123",
  razorpay_payment_id: "pay_TEST123",
};

function createAdmin(options?: {
  connection?: Record<string, unknown> | null;
  connectionError?: { code: string } | null;
  order?: Record<string, unknown> | null;
  orderError?: { code: string } | null;
  recordError?: { code: string } | null;
  claims?: unknown[];
}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "claim_razorpay_partner_webhook_events") {
      return { data: options?.claims ?? [claim], error: null };
    }
    if (name === "record_razorpay_checkout_payment") {
      return { data: null, error: options?.recordError ?? null };
    }
    if (name === "finish_razorpay_partner_webhook_event") {
      return { data: true, error: null };
    }
    return { data: null, error: { code: "unexpected_rpc" } };
  });

  const from = vi.fn((table: string) => {
    const result = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    result.select.mockReturnValue(result);
    result.eq.mockReturnValue(result);
    result.maybeSingle.mockImplementation(async () => {
      if (table === "creator_razorpay_connections") {
        return {
          data:
            options && "connection" in options
              ? options.connection
              : {
                  razorpay_account_id: claim.razorpay_account_id,
                  client_id: "test-client",
                  environment: "test",
                  connection_status: "connected",
                },
          error: options?.connectionError ?? null,
        };
      }
      return {
        data: options && "order" in options ? options.order : order,
        error: options?.orderError ?? null,
      };
    });
    return result;
  });

  return { rpc, from };
}

function mockProvider(
  overrides: {
    order?: Record<string, unknown>;
    payment?: Record<string, unknown>;
  } = {},
) {
  mocks.razorpayApiRequest.mockImplementation(async (_token: string, path: string) =>
    path.includes("/orders/")
      ? {
          id: claim.razorpay_order_id,
          amount: 29900,
          currency: "INR",
          receipt: order.id,
          ...overrides.order,
        }
      : {
          id: claim.razorpay_payment_id,
          order_id: claim.razorpay_order_id,
          amount: 29900,
          currency: "INR",
          status: "captured",
          captured: true,
          account_id: claim.razorpay_account_id,
          ...overrides.payment,
        },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RAZORPAY_OAUTH_CLIENT_ID", "test-client");
  mocks.getFreeProductDeliveryConfig.mockReturnValue({
    maxDownloads: 3,
    expiryHours: 48,
  });
  mocks.getRazorpayCheckoutConnection.mockResolvedValue({
    creatorId: claim.creator_id,
    accountId: claim.razorpay_account_id,
    environment: "test",
    publicToken: "rzp_test_public",
    accessToken: "creator-oauth-token",
  });
  mockProvider();
});

describe("application-level Razorpay webhook fulfillment", () => {
  it.each([
    ["creator A", claim, order],
    [
      "creator B",
      {
        ...claim,
        creator_id: "creator-b",
        razorpay_account_id: "acc_B456",
        razorpay_order_id: "order_B456",
        razorpay_payment_id: "pay_B456",
      },
      {
        ...order,
        id: "internal-order-b",
        creator_id: "creator-b",
        razorpay_order_id: "order_B456",
      },
    ],
  ])("verifies and fulfills %s using its own OAuth connection", async (_label, event, checkoutOrder) => {
    const admin = createAdmin({
      claims: [event],
      connection: {
        razorpay_account_id: event.razorpay_account_id,
        client_id: "test-client",
        environment: "test",
        connection_status: "connected",
      },
      order: checkoutOrder,
    });
    mocks.getRazorpayCheckoutConnection.mockResolvedValue({
      creatorId: event.creator_id,
      accountId: event.razorpay_account_id,
      environment: "test",
      publicToken: "rzp_test_public",
      accessToken: `token-${event.creator_id}`,
    });
    mocks.razorpayApiRequest.mockImplementation(async (token: string, path: string) =>
      path.includes("/orders/")
        ? {
            id: event.razorpay_order_id,
            amount: 29900,
            currency: "INR",
            receipt: checkoutOrder.id,
          }
        : {
            id: event.razorpay_payment_id,
            order_id: event.razorpay_order_id,
            amount: 29900,
            currency: "INR",
            status: "captured",
            captured: true,
            account_id: event.razorpay_account_id,
            token,
          },
    );

    const result = await processRazorpayPartnerWebhookQueue(admin as never, event.event_id);

    expect(result).toEqual({ claimed: 1, processed: 1, ignored: 0, failed: 0 });
    expect(admin.rpc).toHaveBeenCalledWith(
      "record_razorpay_checkout_payment",
      expect.objectContaining({
        p_order_id: checkoutOrder.id,
        p_payment_id: event.razorpay_payment_id,
        p_captured: true,
      }),
    );
    expect(mocks.getRazorpayCheckoutConnection).toHaveBeenCalledWith(event.creator_id);
    expect(mocks.razorpayApiRequest).toHaveBeenCalledWith(
      `token-${event.creator_id}`,
      expect.any(String),
      {},
      5000,
    );
  });

  it("does not fulfill a disconnected creator account", async () => {
    const admin = createAdmin({
      connection: {
        razorpay_account_id: claim.razorpay_account_id,
        client_id: "test-client",
        environment: "test",
        connection_status: "disconnected",
      },
    });

    const result = await processRazorpayPartnerWebhookQueue(admin as never, claim.event_id);

    expect(result).toEqual({ claimed: 1, processed: 0, ignored: 1, failed: 0 });
    expect(mocks.getRazorpayCheckoutConnection).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalledWith(
      "record_razorpay_checkout_payment",
      expect.anything(),
    );
  });

  it("does not match an order belonging to a different creator or account", async () => {
    const admin = createAdmin({
      connection: {
        razorpay_account_id: "acc_OTHER",
        client_id: "test-client",
        environment: "test",
        connection_status: "connected",
      },
    });

    const result = await processRazorpayPartnerWebhookQueue(admin as never, claim.event_id);

    expect(result.ignored).toBe(1);
    expect(mocks.getRazorpayCheckoutConnection).not.toHaveBeenCalled();
  });

  it("ignores an internal order owned by a different creator", async () => {
    const admin = createAdmin({
      order: { ...order, creator_id: "creator-b" },
    });

    const result = await processRazorpayPartnerWebhookQueue(admin as never, claim.event_id);

    expect(result.ignored).toBe(1);
    expect(admin.rpc).not.toHaveBeenCalledWith(
      "record_razorpay_checkout_payment",
      expect.anything(),
    );
  });

  it.each([
    ["wrong order", { payment: { order_id: "order_OTHER" } }],
    ["wrong payment amount", { payment: { amount: 1 } }],
    ["wrong currency", { payment: { currency: "USD" } }],
    ["wrong merchant", { payment: { account_id: "acc_OTHER" } }],
    ["not captured", { payment: { status: "authorized", captured: false } }],
    ["wrong provider receipt", { order: { receipt: "other-order" } }],
  ])("does not fulfill a payment with %s", async (_label, overrides) => {
    mockProvider(overrides);
    const admin = createAdmin();

    const result = await processRazorpayPartnerWebhookQueue(admin as never, claim.event_id);

    expect(result.processed).toBe(0);
    expect(admin.rpc).not.toHaveBeenCalledWith(
      "record_razorpay_checkout_payment",
      expect.anything(),
    );
  });

  it("retries when the creator OAuth connection or provider API is unavailable", async () => {
    mocks.getRazorpayCheckoutConnection.mockResolvedValue(null);
    const admin = createAdmin();

    const result = await processRazorpayPartnerWebhookQueue(admin as never, claim.event_id);

    expect(result).toEqual({ claimed: 1, processed: 0, ignored: 0, failed: 1 });
    expect(admin.rpc).toHaveBeenCalledWith(
      "finish_razorpay_partner_webhook_event",
      expect.objectContaining({
        p_processing_status: "failed",
        p_error_code: "verification_or_persistence_failed",
      }),
    );
    expect(admin.rpc).not.toHaveBeenCalledWith(
      "record_razorpay_checkout_payment",
      expect.anything(),
    );
  });

  it("retries provider API failures without granting access", async () => {
    mocks.razorpayApiRequest.mockRejectedValue(new Error("network unavailable"));
    const admin = createAdmin();

    const result = await processRazorpayPartnerWebhookQueue(admin as never, claim.event_id);

    expect(result.failed).toBe(1);
    expect(admin.rpc).not.toHaveBeenCalledWith(
      "record_razorpay_checkout_payment",
      expect.anything(),
    );
  });

  it("records a captured payment only once when an event is replayed", async () => {
    const admin = createAdmin({ claims: [claim] });

    await processRazorpayPartnerWebhookQueue(admin as never, claim.event_id);
    (admin.rpc as ReturnType<typeof vi.fn>).mockImplementation(async (name: string) => {
      if (name === "claim_razorpay_partner_webhook_events") {
        return { data: [], error: null };
      }
      if (name === "finish_razorpay_partner_webhook_event") {
        return { data: true, error: null };
      }
      return { data: null, error: null };
    });
    await processRazorpayPartnerWebhookQueue(admin as never, claim.event_id);

    expect(admin.rpc).toHaveBeenCalledTimes(4);
    expect(admin.rpc).toHaveBeenCalledWith(
      "record_razorpay_checkout_payment",
      expect.anything(),
    );
  });

  it("does not report fulfillment if persistence fails", async () => {
    const admin = createAdmin({ recordError: { code: "database_unavailable" } });

    const result = await processRazorpayPartnerWebhookQueue(admin as never, claim.event_id);

    expect(result).toEqual({ claimed: 1, processed: 0, ignored: 0, failed: 1 });
  });
});
