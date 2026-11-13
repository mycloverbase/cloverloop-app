import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { POST } from "@/app/api/purchase-download/route";

function makeRequest(checkoutToken: string) {
  return new Request("https://cloverloop.test/api/purchase-download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ checkoutToken }),
  });
}

function createAdmin(entitlement: Record<string, unknown>) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: entitlement,
      error: null,
    }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return {
    from: vi.fn().mockReturnValue(query),
    storage: { from: vi.fn() },
    rpc: vi.fn(),
  };
}

const checkoutToken = "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isValidCheckoutToken.mockReturnValue(true);
  mocks.hashCheckoutToken.mockReturnValue("a".repeat(64));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/purchase-download", () => {
  it.each([
    {
      label: "expired",
      expires_at: "2020-01-01T00:00:00.000Z",
      download_count: 0,
      max_downloads: 3,
    },
    {
      label: "at its download limit",
      expires_at: "2099-01-01T00:00:00.000Z",
      download_count: 3,
      max_downloads: 3,
    },
  ])("rejects a purchase link that is $label", async (limits) => {
    const admin = createAdmin({
      id: "entitlement-a",
      order_id: "order-a",
      creator_id: "creator-a",
      storefront_id: "storefront-a",
      product_id: "product-a",
      expires_at: limits.expires_at,
      download_count: limits.download_count,
      max_downloads: limits.max_downloads,
      status: "active",
    });
    mocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(makeRequest(checkoutToken));

    expect(response.status).toBe(410);
    expect(admin.storage.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed tokens before querying entitlement records", async () => {
    const admin = createAdmin({});
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.isValidCheckoutToken.mockReturnValue(false);

    const response = await POST(makeRequest("not-a-token"));

    expect(response.status).toBe(400);
    expect(admin.from).not.toHaveBeenCalled();
  });
});
