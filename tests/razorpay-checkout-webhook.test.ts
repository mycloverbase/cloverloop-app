import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getFreeProductDeliveryConfig: vi.fn(),
  getRazorpayCheckoutConnection: vi.fn(),
  getRazorpayPartnerTestWebhookSecret: vi.fn(),
  getRazorpayTestWebhookSecret: vi.fn(),
  isRazorpayPartnerWebhookFulfillmentEnabled: vi.fn(),
  processRazorpayPartnerWebhookQueue: vi.fn(),
  processRazorpayPurchaseEmailQueue: vi.fn(),
  razorpayApiRequest: vi.fn(),
  verifyRazorpayWebhookSignature: vi.fn(),
  scheduled: [] as Array<() => Promise<void>>,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: mocks.after };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/razorpay/checkout", () => ({
  getFreeProductDeliveryConfig: mocks.getFreeProductDeliveryConfig,
  getRazorpayCheckoutConnection: mocks.getRazorpayCheckoutConnection,
  getRazorpayPartnerTestWebhookSecret: mocks.getRazorpayPartnerTestWebhookSecret,
  getRazorpayTestWebhookSecret: mocks.getRazorpayTestWebhookSecret,
  isRazorpayPartnerWebhookFulfillmentEnabled:
    mocks.isRazorpayPartnerWebhookFulfillmentEnabled,
  razorpayApiRequest: mocks.razorpayApiRequest,
  verifyRazorpayWebhookSignature: mocks.verifyRazorpayWebhookSignature,
}));

vi.mock("@/lib/razorpay/webhook-fulfillment", () => ({
  processRazorpayPartnerWebhookQueue: mocks.processRazorpayPartnerWebhookQueue,
}));

vi.mock("@/lib/razorpay/purchase-email", () => ({
  processRazorpayPurchaseEmailQueue: mocks.processRazorpayPurchaseEmailQueue,
}));

import { POST } from "@/app/api/webhooks/razorpay/route";

const eventPayload = {
  event: "payment.captured",
  account_id: "acc_ABC123",
  payload: {
    payment: {
      entity: {
        id: "pay_TEST123",
        order_id: "order_TEST123",
      },
    },
  },
};

function makePartnerRequest(
  payload: unknown = eventPayload,
  body = JSON.stringify(payload),
  eventId = "event_TEST123",
) {
  return new Request("https://cloverloop.test/api/webhooks/razorpay", {
    method: "POST",
    headers: {
      "x-razorpay-signature": "partner-signature",
      "x-razorpay-event-id": eventId,
    },
    body,
  });
}

function createPartnerAdmin(options: {
  mapping?: Record<string, unknown> | null;
  mappingError?: { code: string } | null;
  insertError?: { code: string } | null;
  existingEvent?: Record<string, unknown> | null;
} = {}) {
  const mappingQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data:
        options.mapping === undefined
          ? { creator_id: "creator-a", client_id: "development-client" }
          : options.mapping,
      error: options.mappingError ?? null,
    }),
  };
  mappingQuery.select.mockReturnValue(mappingQuery);
  mappingQuery.eq.mockReturnValue(mappingQuery);

  let storedEvent = options.existingEvent ?? null;
  let updateResult: { error: unknown } = { error: null };
  const eventQuery = {
    insert: vi.fn().mockResolvedValue({ error: options.insertError ?? null }),
    update: vi.fn((changes: Record<string, unknown>) => {
      storedEvent = storedEvent ? { ...storedEvent, ...changes } : null;
      updateResult = { error: null };
      return eventQuery;
    }),
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      get data() {
        return storedEvent;
      },
      error: null,
    }),
    then: (resolve: (value: typeof updateResult) => unknown) =>
      Promise.resolve(updateResult).then(resolve),
  };
  eventQuery.select.mockReturnValue(eventQuery);
  eventQuery.eq.mockReturnValue(eventQuery);
  eventQuery.is.mockReturnValue(eventQuery);
  eventQuery.in.mockReturnValue(eventQuery);

  const admin = {
    from: vi.fn((table: string) =>
      table === "creator_razorpay_connections" ? mappingQuery : eventQuery,
    ),
    rpc: vi.fn(),
  };
  return { admin, mappingQuery, eventQuery };
}

function createAccountScopedAdmin() {
  const internalOrder = {
    id: "internal-order-a",
    creator_id: "creator-a",
    amount_paise: 29900,
    currency: "INR",
    razorpay_order_id: "order_TEST123",
  };
  const from = vi.fn((table: string) => {
    let result: { data?: unknown; error: unknown } = { error: null };
    const query = {
      select: vi.fn(),
      update: vi.fn(),
      insert: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
      then: (resolve: (value: typeof result) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    query.select.mockReturnValue(query);
    query.update.mockImplementation(() => {
      result = { error: null };
      return query;
    });
    query.insert.mockImplementation(() => {
      result = { error: null };
      return query;
    });
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockImplementation(async () => {
      if (table === "razorpay_checkout_orders") {
        return { data: internalOrder, error: null };
      }
      if (table === "razorpay_checkout_webhooks") {
        return {
          data: { razorpay_webhook_id: "hook_TEST123" },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    return query;
  });
  return {
    from,
    rpc: vi.fn().mockResolvedValue({
      data: [{ order_status: "paid", fulfillment_status: "ready" }],
      error: null,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scheduled.length = 0;
  mocks.after.mockImplementation((callback: () => Promise<void>) => {
    mocks.scheduled.push(callback);
  });
  vi.stubEnv("RAZORPAY_OAUTH_MODE", "test");
  vi.stubEnv("RAZORPAY_OAUTH_ENABLED", "true");
  vi.stubEnv("RAZORPAY_OAUTH_CLIENT_ID", "development-client");
  vi.stubEnv("RAZORPAY_PARTNER_WEBHOOK_DIAGNOSTICS", "false");
  mocks.getRazorpayPartnerTestWebhookSecret.mockReturnValue("partner-secret");
  mocks.getRazorpayTestWebhookSecret.mockReturnValue("account-secret");
  mocks.isRazorpayPartnerWebhookFulfillmentEnabled.mockReturnValue(false);
  mocks.processRazorpayPartnerWebhookQueue.mockResolvedValue({
    claimed: 1,
    processed: 1,
    ignored: 0,
    failed: 0,
  });
  mocks.processRazorpayPurchaseEmailQueue.mockResolvedValue({
    claimed: 0,
    accepted: 0,
    failed: 0,
  });
  mocks.verifyRazorpayWebhookSignature.mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/razorpay application-level fulfillment", () => {
  it("persists a signed captured event before scheduling fulfillment", async () => {
    const { admin, eventQuery } = createPartnerAdmin();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.isRazorpayPartnerWebhookFulfillmentEnabled.mockReturnValue(true);
    mocks.verifyRazorpayWebhookSignature.mockImplementation(
      (_body: string, signature: string | null, secret: string) =>
        signature === "partner-signature" && secret === "partner-secret",
    );

    const response = await POST(makePartnerRequest());

    expect(response.status).toBe(200);
    expect(eventQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: "event_TEST123",
        event_type: "payment.captured",
        creator_id: "creator-a",
        razorpay_account_id: "acc_ABC123",
        razorpay_order_id: "order_TEST123",
        razorpay_payment_id: "pay_TEST123",
        environment: "test",
        processing_status: "received",
      }),
    );
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.processRazorpayPartnerWebhookQueue).not.toHaveBeenCalled();
    expect(JSON.stringify(info.mock.calls)).not.toContain("buyer@example.test");

    await mocks.scheduled[0]();
    expect(mocks.processRazorpayPartnerWebhookQueue).toHaveBeenCalledWith(
      admin,
      "event_TEST123",
      1,
    );
  });

  it("rejects a modified raw body with the original signature", async () => {
    const { admin } = createPartnerAdmin();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const originalBody = JSON.stringify(eventPayload);
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.isRazorpayPartnerWebhookFulfillmentEnabled.mockReturnValue(true);
    mocks.verifyRazorpayWebhookSignature.mockImplementation(
      (body: string, _signature: string | null, secret: string) =>
        body === originalBody && secret === "partner-secret",
    );

    const tampered = JSON.stringify({
      ...eventPayload,
      account_id: "acc_CHANGED",
    });
    const response = await POST(makePartnerRequest(eventPayload, tampered));

    expect(response.status).toBe(400);
    expect(admin.from).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(JSON.stringify(warning.mock.calls)).not.toContain("partner-secret");
  });

  it("rejects invalid signatures and events missing account_id", async () => {
    const { admin } = createPartnerAdmin();
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.isRazorpayPartnerWebhookFulfillmentEnabled.mockReturnValue(true);
    mocks.verifyRazorpayWebhookSignature.mockImplementation(
      (_body: string, signature: string | null, secret: string) =>
        signature === "partner-signature" && secret === "partner-secret",
    );

    const missingAccountResponse = await POST(
      makePartnerRequest({
        event: "payment.captured",
        payload: eventPayload.payload,
      }),
    );
    expect(missingAccountResponse.status).toBe(400);
    expect(admin.from).not.toHaveBeenCalled();

    const missingSignatureResponse = await POST(
      new Request("https://cloverloop.test/api/webhooks/razorpay", {
        method: "POST",
        headers: { "x-razorpay-event-id": "event_TEST123" },
        body: JSON.stringify(eventPayload),
      }),
    );
    expect(missingSignatureResponse.status).toBe(400);
    expect(admin.from).not.toHaveBeenCalled();

    mocks.verifyRazorpayWebhookSignature.mockReturnValue(false);
    const invalidResponse = await POST(makePartnerRequest());

    expect(invalidResponse.status).toBe(400);
    expect(admin.from).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("rejects missing event IDs and inconsistent embedded account IDs", async () => {
    const { admin } = createPartnerAdmin();
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.isRazorpayPartnerWebhookFulfillmentEnabled.mockReturnValue(true);
    mocks.verifyRazorpayWebhookSignature.mockImplementation(
      (_body: string, _signature: string | null, secret: string) =>
        secret === "partner-secret",
    );

    const missingIdResponse = await POST(
      makePartnerRequest(eventPayload, JSON.stringify(eventPayload), ""),
    );
    expect(missingIdResponse.status).toBe(400);
    expect(admin.from).not.toHaveBeenCalled();

    const inconsistentAccountResponse = await POST(
      makePartnerRequest({
        ...eventPayload,
        payload: {
          payment: {
            entity: {
              id: "pay_TEST123",
              order_id: "order_TEST123",
              account_id: "acc_OTHER123",
            },
          },
        },
      }),
    );
    expect(inconsistentAccountResponse.status).toBe(400);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("rejects unknown creator accounts without persisting an event", async () => {
    const { admin, eventQuery } = createPartnerAdmin({ mapping: null });
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.isRazorpayPartnerWebhookFulfillmentEnabled.mockReturnValue(true);
    mocks.verifyRazorpayWebhookSignature.mockImplementation(
      (_body: string, _signature: string | null, secret: string) =>
        secret === "partner-secret",
    );

    const response = await POST(makePartnerRequest());

    expect(response.status).toBe(400);
    expect(eventQuery.insert).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("acknowledges an identical duplicate event without duplicating queue state", async () => {
    const { admin, eventQuery } = createPartnerAdmin({
      insertError: { code: "23505" },
      existingEvent: {
        event_type: "payment.captured",
        razorpay_account_id: "acc_ABC123",
        creator_id: "creator-a",
        razorpay_order_id: "order_TEST123",
        razorpay_payment_id: "pay_TEST123",
        processing_status: "processed",
      },
    });
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.isRazorpayPartnerWebhookFulfillmentEnabled.mockReturnValue(true);
    mocks.verifyRazorpayWebhookSignature.mockImplementation(
      (_body: string, _signature: string | null, secret: string) =>
        secret === "partner-secret",
    );

    const response = await POST(makePartnerRequest());

    expect(response.status).toBe(200);
    expect(eventQuery.insert).toHaveBeenCalledOnce();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("requeues a previously processed account-scoped event with the same event ID", async () => {
    const { admin, eventQuery } = createPartnerAdmin({
      insertError: { code: "23505" },
      existingEvent: {
        event_type: "payment.captured",
        razorpay_account_id: "acc_ABC123",
        environment: "test",
        creator_id: null,
        razorpay_order_id: null,
        razorpay_payment_id: null,
        processing_status: "processed",
      },
    });
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.isRazorpayPartnerWebhookFulfillmentEnabled.mockReturnValue(true);
    mocks.verifyRazorpayWebhookSignature.mockImplementation(
      (_body: string, signature: string | null, secret: string) =>
        signature === "partner-signature" && secret === "partner-secret",
    );

    const response = await POST(makePartnerRequest());

    expect(response.status).toBe(200);
    expect(eventQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        creator_id: "creator-a",
        razorpay_order_id: "order_TEST123",
        razorpay_payment_id: "pay_TEST123",
        processing_status: "received",
      }),
    );
    expect(mocks.after).toHaveBeenCalledOnce();
  });

  it("does not enqueue non-captured application events", async () => {
    const { admin } = createPartnerAdmin();
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.isRazorpayPartnerWebhookFulfillmentEnabled.mockReturnValue(true);
    mocks.verifyRazorpayWebhookSignature.mockImplementation(
      (_body: string, _signature: string | null, secret: string) =>
        secret === "partner-secret",
    );

    const response = await POST(
      makePartnerRequest({ ...eventPayload, event: "payment.failed" }),
    );

    expect(response.status).toBe(200);
    expect(admin.from).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("preserves the legacy account-scoped fulfillment path", async () => {
    const admin = createAccountScopedAdmin();
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.isRazorpayPartnerWebhookFulfillmentEnabled.mockReturnValue(false);
    mocks.verifyRazorpayWebhookSignature.mockImplementation(
      (_body: string, _signature: string | null, secret: string) =>
        secret === "account-secret",
    );
    mocks.getRazorpayCheckoutConnection.mockResolvedValue({
      creatorId: "creator-a",
      accountId: "acc_ABC123",
      environment: "test",
      publicToken: "rzp_test_public",
      accessToken: "creator-oauth-token",
    });
    mocks.getFreeProductDeliveryConfig.mockReturnValue({
      maxDownloads: 3,
      expiryHours: 48,
    });
    mocks.razorpayApiRequest.mockImplementation(async (_token: string, path: string) =>
      path.includes("/orders/")
        ? {
            id: "order_TEST123",
            amount: 29900,
            currency: "INR",
            receipt: "internal-order-a",
          }
        : {
            id: "pay_TEST123",
            order_id: "order_TEST123",
            amount: 29900,
            currency: "INR",
            status: "captured",
            captured: true,
            account_id: "acc_ABC123",
          },
    );

    const response = await POST(
      new Request("https://cloverloop.test/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "x-razorpay-signature": "account-signature",
          "x-razorpay-event-id": "event_ACCOUNT123",
        },
        body: JSON.stringify({
          event: "payment.captured",
          account_id: "acc_ABC123",
          payload: {
            payment: {
              entity: {
                id: "pay_TEST123",
                order_id: "order_TEST123",
              },
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(admin.rpc).toHaveBeenCalledWith(
      "record_razorpay_checkout_payment",
      expect.objectContaining({
        p_order_id: "internal-order-a",
        p_payment_id: "pay_TEST123",
        p_captured: true,
      }),
    );
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
