import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { POST } from "@/app/api/purchase-download/email/route";
import { createPurchaseDownloadTicket } from "@/lib/razorpay/purchase-email";

const orderId = "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e";

function createAdmin(expiresAt: string) {
  const rows: Record<string, unknown> = {
    product_purchase_entitlements: {
      order_id: orderId,
      creator_id: "creator-a",
      storefront_id: "storefront-a",
      product_id: "product-a",
      expires_at: expiresAt,
      status: "active",
      download_count: 0,
      max_downloads: 3,
    },
    razorpay_checkout_orders: {
      order_status: "paid",
      fulfillment_status: "ready",
    },
    storefront_products: {
      file_path: "creator-a/product-a/private-file.pdf",
      file_name: "guide.pdf",
    },
    creator_storefronts: { id: "storefront-a" },
  };
  const client = {
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        is: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => ({ data: rows[table], error: null })),
      };
      return builder;
    }),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: "https://storage.example.test/signed-file" },
          error: null,
        }),
      })),
    },
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  };
  return client;
}

function request(body: unknown) {
  return new Request("https://cloverloop.test/api/purchase-download/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PURCHASE_DOWNLOAD_LINK_SECRET", "test-purchase-link-secret-that-is-long-enough");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/purchase-download/email", () => {
  it("validates the signed ticket and preserves private storage and download limits", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const signature = createPurchaseDownloadTicket(orderId, expiresAt);
    const admin = createAdmin(new Date(expiresAt * 1000).toISOString());
    mocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(request({ orderId, expiresAt, signature }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toEqual({ downloadUrl: "https://storage.example.test/signed-file" });
    expect(admin.storage.from).toHaveBeenCalledWith("product-files");
    expect(admin.rpc).toHaveBeenCalledWith("record_paid_product_download_by_order", {
      p_order_id: orderId,
    });
    expect(JSON.stringify(result)).not.toContain("private-file.pdf");
  });

  it("rejects a tampered email ticket before accessing the entitlement", async () => {
    const admin = createAdmin(new Date(Date.now() + 3600 * 1000).toISOString());
    mocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(request({
      orderId,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      signature: "x".repeat(43),
    }));

    expect(response.status).toBe(400);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.storage.from).not.toHaveBeenCalled();
  });
});
