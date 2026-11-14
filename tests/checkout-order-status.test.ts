import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  hashCheckoutToken: vi.fn(),
  isValidCheckoutToken: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/razorpay/checkout", () => ({
  hashCheckoutToken: mocks.hashCheckoutToken,
  isValidCheckoutToken: mocks.isValidCheckoutToken,
}));

import { GET } from "@/app/api/checkout/order-status/route";

const orderId = "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e";

function createAdmin() {
  const orderQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        order_status: "paid",
        payment_status: "captured",
        fulfillment_status: "ready",
      },
      error: null,
    }),
  };
  orderQuery.select.mockReturnValue(orderQuery);
  orderQuery.eq.mockReturnValue(orderQuery);
  const emailQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { status: "accepted" },
      error: null,
    }),
  };
  emailQuery.select.mockReturnValue(emailQuery);
  emailQuery.eq.mockReturnValue(emailQuery);
  return {
    from: vi.fn((table: string) => table === "razorpay_purchase_emails" ? emailQuery : orderQuery),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isValidCheckoutToken.mockReturnValue(true);
  mocks.hashCheckoutToken.mockReturnValue("a".repeat(64));
});

describe("GET /api/checkout/order-status", () => {
  it("reports delivery status without exposing a download link", async () => {
    const admin = createAdmin();
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    const response = await GET(new Request(
      `https://cloverloop.test/api/checkout/order-status?orderId=${orderId}`,
      { headers: { "x-checkout-token": "checkout-session-token" } },
    ));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toEqual({
      orderStatus: "paid",
      paymentStatus: "captured",
      fulfillmentStatus: "ready",
      purchaseEmailStatus: "accepted",
    });
    expect(result).not.toHaveProperty("downloadUrl");
  });
});
