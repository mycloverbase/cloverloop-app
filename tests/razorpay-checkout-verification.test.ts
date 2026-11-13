import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  getRazorpayCheckoutConnection: vi.fn(),
  hashCheckoutToken: vi.fn(),
  isRazorpayCheckoutEnabled: vi.fn(),
  isValidCheckoutToken: vi.fn(),
  razorpayApiRequest: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/razorpay/checkout", () => ({
  getRazorpayCheckoutConnection: mocks.getRazorpayCheckoutConnection,
  hashCheckoutToken: mocks.hashCheckoutToken,
  isRazorpayCheckoutEnabled: mocks.isRazorpayCheckoutEnabled,
  isValidCheckoutToken: mocks.isValidCheckoutToken,
  razorpayApiRequest: mocks.razorpayApiRequest,
}));

import { POST } from "@/app/api/checkout/verify-payment/route";

const checkoutOrder = {
  id: "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e",
  creator_id: "creator-a",
  amount_paise: 29900,
  currency: "INR",
  razorpay_order_id: "order_test123",
  order_status: "pending",
};

function makeAdmin() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    insert: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: checkoutOrder, error: null });
  query.insert.mockResolvedValue({ error: null });

  return {
    from: vi.fn().mockReturnValue(query),
    rpc: vi.fn(),
  };
}

function makeRequest() {
  return new Request("https://cloverloop.test/api/checkout/verify-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      checkoutToken: "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e",
      orderId: checkoutOrder.id,
      razorpayOrderId: checkoutOrder.razorpay_order_id,
      razorpayPaymentId: "pay_test123",
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RAZORPAY_OAUTH_MODE", "test");
  mocks.isRazorpayCheckoutEnabled.mockReturnValue(true);
  mocks.isValidCheckoutToken.mockReturnValue(true);
  mocks.hashCheckoutToken.mockReturnValue("a".repeat(64));
  mocks.getRazorpayCheckoutConnection.mockResolvedValue({
    creatorId: "creator-a",
    accountId: "account-a",
    publicToken: "rzp_test_public",
    accessToken: "server-only-access-token",
  });
  mocks.razorpayApiRequest.mockImplementation(async (_token: string, path: string) => {
    if (path.includes("/orders/")) {
      return {
        id: checkoutOrder.razorpay_order_id,
        amount: checkoutOrder.amount_paise,
        currency: checkoutOrder.currency,
        receipt: checkoutOrder.id,
      };
    }
    return {
      id: "pay_test123",
      order_id: checkoutOrder.razorpay_order_id,
      amount: checkoutOrder.amount_paise,
      currency: checkoutOrder.currency,
      status: "captured",
      captured: true,
    };
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/checkout/verify-payment", () => {
  it("does not grant access from the browser callback, even when the API confirms capture", async () => {
    const admin = makeAdmin();
    mocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "processing" });
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("reports an authorized but uncaptured payment without granting access", async () => {
    const admin = makeAdmin();
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.razorpayApiRequest.mockImplementation(async (_token: string, path: string) => {
      if (path.includes("/orders/")) {
        return {
          id: checkoutOrder.razorpay_order_id,
          amount: checkoutOrder.amount_paise,
          currency: checkoutOrder.currency,
          receipt: checkoutOrder.id,
        };
      }
      return {
        id: "pay_test123",
        order_id: checkoutOrder.razorpay_order_id,
        amount: checkoutOrder.amount_paise,
        currency: checkoutOrder.currency,
        status: "authorized",
        captured: false,
      };
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "not_captured" });
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});
