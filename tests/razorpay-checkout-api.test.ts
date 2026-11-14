import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  checkFreeProductRateLimit: vi.fn(),
  getFreeProductDeliveryConfig: vi.fn(),
  getRazorpayCheckoutConnection: vi.fn(),
  hashCheckoutToken: vi.fn(),
  isRazorpayCheckoutEnabled: vi.fn(),
  isRazorpayPartnerWebhookFulfillmentEnabled: vi.fn(),
  isRazorpayPurchaseEmailDeliveryConfigured: vi.fn(),
  isValidCheckoutToken: vi.fn(),
  normalizeCustomerEmail: vi.fn(),
  razorpayApiRequest: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/free-products/server", () => ({
  checkFreeProductRateLimit: mocks.checkFreeProductRateLimit,
}));

vi.mock("@/lib/razorpay/checkout", () => ({
  getFreeProductDeliveryConfig: mocks.getFreeProductDeliveryConfig,
  getRazorpayCheckoutConnection: mocks.getRazorpayCheckoutConnection,
  hashCheckoutToken: mocks.hashCheckoutToken,
  isRazorpayCheckoutEnabled: mocks.isRazorpayCheckoutEnabled,
  isRazorpayPartnerWebhookFulfillmentEnabled:
    mocks.isRazorpayPartnerWebhookFulfillmentEnabled,
  isValidCheckoutToken: mocks.isValidCheckoutToken,
  normalizeCustomerEmail: mocks.normalizeCustomerEmail,
  razorpayApiRequest: mocks.razorpayApiRequest,
}));

vi.mock("@/lib/razorpay/purchase-email", () => ({
  isRazorpayPurchaseEmailDeliveryConfigured:
    mocks.isRazorpayPurchaseEmailDeliveryConfigured,
}));

import { POST } from "@/app/api/checkout/create-order/route";

const creatorConnection = {
  creatorId: "creator-a",
  accountId: "account-a",
  publicToken: "rzp_test_public",
  accessToken: "server-only-access-token",
};

const orderRow = {
  order_id: "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e",
  creator_id: "creator-a",
  storefront_id: "storefront-a",
  storefront_name: "Creator A",
  storefront_username: "creator-a",
  product_id: "95ab1e94-38c3-4f4f-a20d-fc2f9192b33e",
  product_name: "Template",
  product_description: "Digital template",
  amount_paise: 29900,
  currency: "INR",
  razorpay_order_id: null as string | null,
  should_create_provider_order: true,
};

function createAdmin(row = orderRow) {
  const query = {
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockResolvedValue({ error: null });

  return {
    rpc: vi.fn().mockResolvedValue({ data: [row], error: null }),
    from: vi.fn().mockReturnValue(query),
  };
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("https://cloverloop.test/api/checkout/create-order", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "192.0.2.10",
    },
    body: JSON.stringify({ customerName: "Test Buyer", ...body }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RAZORPAY_OAUTH_MODE", "test");
  vi.stubEnv("RAZORPAY_PARTNER_WEBHOOK_DIAGNOSTICS", "false");
  mocks.isRazorpayCheckoutEnabled.mockReturnValue(true);
  mocks.isRazorpayPartnerWebhookFulfillmentEnabled.mockReturnValue(true);
  mocks.isRazorpayPurchaseEmailDeliveryConfigured.mockReturnValue(true);
  mocks.checkFreeProductRateLimit.mockResolvedValue(true);
  mocks.getFreeProductDeliveryConfig.mockReturnValue({
    maxDownloads: 3,
    expiryHours: 48,
  });
  mocks.getRazorpayCheckoutConnection.mockResolvedValue(creatorConnection);
  mocks.hashCheckoutToken.mockReturnValue("a".repeat(64));
  mocks.isValidCheckoutToken.mockReturnValue(true);
  mocks.normalizeCustomerEmail.mockReturnValue("buyer@example.com");
  mocks.razorpayApiRequest.mockResolvedValue({
    id: "order_test123",
    amount: 29900,
    currency: "INR",
    receipt: orderRow.order_id,
    status: "created",
  });
  mocks.createSupabaseAdminClient.mockReturnValue(createAdmin());
});

describe("POST /api/checkout/create-order", () => {
  it("uses the database price and server-derived creator instead of client values", async () => {
    const response = await POST(
      makeRequest({
        productId: orderRow.product_id,
        storefrontUsername: orderRow.storefront_username,
        email: "buyer@example.com",
        checkoutToken: "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e",
        creatorId: "creator-b",
        amount: 1,
        pricePaise: 1,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getRazorpayCheckoutConnection).toHaveBeenCalledWith("creator-a");
    const providerBody = JSON.parse(
      mocks.razorpayApiRequest.mock.calls[0][2].body as string,
    );
    expect(providerBody.amount).toBe(29900);
    expect(providerBody.currency).toBe("INR");
    expect(body.publicKey).toBe("rzp_test_public");
    expect(body.customerName).toBe("Test Buyer");
    expect(body).not.toHaveProperty("accessToken");
    expect(body).not.toHaveProperty("refreshToken");
    expect(mocks.createSupabaseAdminClient.mock.results[0].value.rpc).toHaveBeenCalledWith(
      "create_razorpay_checkout_order",
      expect.objectContaining({
        p_customer_name: "Test Buyer",
        p_customer_phone: null,
      }),
    );
  });

  it("reuses an existing provider order for the same checkout token", async () => {
    const admin = createAdmin({
      ...orderRow,
      razorpay_order_id: "order_existing123",
      should_create_provider_order: false,
    });
    mocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      makeRequest({
        productId: orderRow.product_id,
        storefrontUsername: orderRow.storefront_username,
        email: "buyer@example.com",
        checkoutToken: "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.razorpayApiRequest).not.toHaveBeenCalled();
    expect((await response.json()).razorpayOrderId).toBe("order_existing123");
  });

  it("refuses to create an order when the creator has no matching Test Mode connection", async () => {
    mocks.getRazorpayCheckoutConnection.mockResolvedValue(null);

    const response = await POST(
      makeRequest({
        productId: orderRow.product_id,
        storefrontUsername: orderRow.storefront_username,
        email: "buyer@example.com",
        checkoutToken: "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e",
      }),
    );

    expect(response.status).toBe(409);
    expect(mocks.razorpayApiRequest).not.toHaveBeenCalled();
  });

  it("creates a creator-scoped Test Mode order without account webhook registration", async () => {
    const response = await POST(
      makeRequest({
        productId: orderRow.product_id,
        storefrontUsername: orderRow.storefront_username,
        email: "buyer@example.com",
        checkoutToken: "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.getRazorpayCheckoutConnection).toHaveBeenCalledWith("creator-a");
    expect(mocks.razorpayApiRequest).toHaveBeenCalledWith(
      "server-only-access-token",
      "/v1/orders",
      expect.objectContaining({ method: "POST" }),
    );
    expect((await response.json()).publicKey).toBe("rzp_test_public");
  });

  it("still requires the creator's Test Mode OAuth connection", async () => {
    mocks.getRazorpayCheckoutConnection.mockResolvedValue(null);

    const response = await POST(
      makeRequest({
        productId: orderRow.product_id,
        storefrontUsername: orderRow.storefront_username,
        email: "buyer@example.com",
        checkoutToken: "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e",
      }),
    );

    expect(response.status).toBe(409);
    expect(mocks.razorpayApiRequest).not.toHaveBeenCalled();
  });

  it("does not create orders when Test Mode webhook fulfillment is not configured", async () => {
    vi.stubEnv("RAZORPAY_PARTNER_WEBHOOK_DIAGNOSTICS", "true");
    mocks.isRazorpayPartnerWebhookFulfillmentEnabled.mockReturnValue(false);

    const response = await POST(
      makeRequest({
        productId: orderRow.product_id,
        storefrontUsername: orderRow.storefront_username,
        email: "buyer@example.com",
        checkoutToken: "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e",
      }),
    );

    expect(response.status).toBe(503);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.razorpayApiRequest).not.toHaveBeenCalled();
  });

  it("never permits Test Mode checkout in Live Mode", async () => {
    vi.stubEnv("RAZORPAY_OAUTH_MODE", "live");
    vi.stubEnv("RAZORPAY_PARTNER_WEBHOOK_DIAGNOSTICS", "true");
    mocks.isRazorpayPartnerWebhookFulfillmentEnabled.mockReturnValue(true);

    const response = await POST(
      makeRequest({
        productId: orderRow.product_id,
        storefrontUsername: orderRow.storefront_username,
        email: "buyer@example.com",
        checkoutToken: "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e",
      }),
    );

    expect(response.status).toBe(503);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.razorpayApiRequest).not.toHaveBeenCalled();
  });

  it("rejects unpublished, free, deleted, or otherwise unavailable products", async () => {
    const admin = createAdmin();
    admin.rpc.mockResolvedValue({
      data: null,
      error: { message: "product_not_available" },
    });
    mocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      makeRequest({
        productId: orderRow.product_id,
        storefrontUsername: orderRow.storefront_username,
        email: "buyer@example.com",
        checkoutToken: "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e",
      }),
    );

    expect(response.status).toBe(404);
    expect(mocks.getRazorpayCheckoutConnection).not.toHaveBeenCalled();
    expect(mocks.razorpayApiRequest).not.toHaveBeenCalled();
  });

  it("does not call Razorpay while the feature gate is off", async () => {
    mocks.isRazorpayCheckoutEnabled.mockReturnValue(false);

    const response = await POST(makeRequest({}));

    expect(response.status).toBe(503);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.razorpayApiRequest).not.toHaveBeenCalled();
  });

  it("does not create payable orders without configured email delivery", async () => {
    mocks.isRazorpayPurchaseEmailDeliveryConfigured.mockReturnValue(false);
    const response = await POST(makeRequest({
      productId: orderRow.product_id,
      storefrontUsername: orderRow.storefront_username,
      email: "buyer@example.com",
      checkoutToken: "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e",
    }));

    expect(response.status).toBe(503);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.razorpayApiRequest).not.toHaveBeenCalled();
  });

  it("requires a full name and never forwards a phone number", async () => {
    const response = await POST(
      makeRequest({
        customerName: "   ",
        productId: orderRow.product_id,
        storefrontUsername: orderRow.storefront_username,
        email: "buyer@example.com",
        customerPhone: "+1-555-555-5555",
        checkoutToken: "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.createSupabaseAdminClient).toHaveBeenCalledOnce();
    expect(mocks.createSupabaseAdminClient.mock.results[0].value.rpc).not.toHaveBeenCalled();
  });
});
