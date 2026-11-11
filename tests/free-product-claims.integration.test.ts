import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { POST as createClaim } from "@/app/api/free-product-claims/route";
import { POST as requestDownload } from "@/app/api/free-product-download/route";

const productId = "dbe6ca23-10d3-4f4f-9203-a115e85c8a9b";
const claimId = "da44d67e-b881-42f3-9638-5ace28fa32d8";
const token = "a".repeat(43);

function createSupabaseFake(options: {
  claimError?: { message: string };
  claimDisposition?: string;
  rateAllowed?: boolean;
  emailSentResult?: boolean;
  claimStatus?: string;
  claimExpiry?: string;
  downloadCount?: number;
  maxDownloads?: number;
} = {}) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const tableRows: Record<string, unknown> = {
    product_claims: {
      id: claimId,
      product_id: productId,
      storefront_id: "c84dcc47-089c-4654-9ab1-bb0bca8d7090",
      creator_id: "a82b0c1a-4677-408c-a941-81912933f061",
      status: options.claimStatus ?? "email_sent",
      token_expires_at: options.claimExpiry ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      download_count: options.downloadCount ?? 0,
      max_downloads: options.maxDownloads ?? 3,
    },
    storefront_products: {
      id: productId,
      storefront_id: "c84dcc47-089c-4654-9ab1-bb0bca8d7090",
      user_id: "a82b0c1a-4677-408c-a941-81912933f061",
      is_free: true,
      price_paise: 0,
      is_active: true,
      file_path: "creator/product/file.pdf",
      file_name: "file.pdf",
      deleted_at: null,
    },
    creator_storefronts: {
      id: "c84dcc47-089c-4654-9ab1-bb0bca8d7090",
      status: "published",
      deleted_at: null,
    },
  };
  const client = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "check_free_product_rate_limit") {
        return { data: options.rateAllowed ?? true, error: null };
      }
      if (name === "claim_free_product" && options.claimError) {
        return { data: null, error: options.claimError };
      }
      if (name === "claim_free_product") {
        return {
          data: [{
            claim_id: claimId,
            product_name: "Creator guide",
            creator_name: "Test Creator",
            product_file_name: "guide.pdf",
            disposition: options.claimDisposition ?? "send_email",
          }],
          error: null,
        };
      }
      if (name === "mark_free_product_claim_email_sent") {
        return { data: options.emailSentResult ?? true, error: null };
      }
      if (name === "record_free_product_download") return { data: true, error: null };
      return { data: true, error: null };
    }),
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        update: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => ({ data: tableRows[table], error: null })),
      };
      return builder;
    }),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async () => ({
          data: { signedUrl: "https://storage.example.test/signed-file?token=short-lived" },
          error: null,
        })),
      })),
    },
    rpcCalls,
  };
  mocks.createSupabaseAdminClient.mockReturnValue(client);
  return client;
}

function claimRequest(overrides: Record<string, unknown> = {}) {
  return new Request("https://cloverloop.test/api/free-product-claims", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "203.0.113.8" },
    body: JSON.stringify({
      productId,
      storefrontUsername: "test-creator",
      email: "  Buyer@Example.com ",
      termsAccepted: true,
      ...overrides,
    }),
  });
}

describe("free product claim and download routes", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    vi.stubEnv("RESEND_API_KEY", "test-resend-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "CloverLoop <hello@example.com>");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("creates a free claim and sends a branded email without returning the raw token", async () => {
    const client = createSupabaseFake();
    const sendEmail = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe("https://api.resend.com/emails");
      expect(init?.method).toBe("POST");
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", sendEmail);

    const response = await createClaim(claimRequest());
    const result = await response.json();
    const claimCall = client.rpcCalls.find((call) => call.name === "claim_free_product");
    const resendCall = sendEmail.mock.calls[0];
    const resendBody = JSON.parse(String(resendCall?.[1]?.body)) as {
      to: string[];
      subject: string;
      html: string;
      text: string;
    };

    expect(response.status).toBe(200);
    expect(result).toEqual({ ok: true, emailSent: true, reused: false });
    expect(claimCall?.args.requested_customer_email).toBe("buyer@example.com");
    expect(claimCall?.args.requested_claim_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(claimCall?.args.requested_claim_token_hash).not.toBe(token);
    expect(resendBody.to).toEqual(["buyer@example.com"]);
    expect(resendBody.subject).toContain("Creator guide");
    expect(resendBody.html).toContain("Download Your Product");
    expect(resendBody.html).toContain("#token=");
    expect(resendBody.text).toContain("https://cloverloop.in/free-product-download#token=");
    expect(JSON.stringify(result)).not.toContain("#token=");
    expect(client.rpcCalls.some((call) => call.name === "mark_free_product_claim_email_sent")).toBe(true);
  });

  it("preserves the claim and records a retryable state when Resend rejects delivery", async () => {
    const client = createSupabaseFake();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));

    const response = await createClaim(claimRequest());
    const result = await response.json();

    expect(response.status).toBe(502);
    expect(result.ok).toBe(false);
    expect(client.rpcCalls.some((call) => call.name === "claim_free_product")).toBe(true);
    expect(client.rpcCalls.some((call) => call.name === "mark_free_product_claim_email_failed")).toBe(true);
    expect(client.rpcCalls.some((call) => call.name === "mark_free_product_claim_email_sent")).toBe(false);
  });

  it("rejects a claim when the database reports the product is unavailable", async () => {
    createSupabaseFake({ claimError: { message: "Free product is not available" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sendEmail = vi.fn();
    vi.stubGlobal("fetch", sendEmail);

    const response = await createClaim(claimRequest());
    const result = await response.json();

    expect(response.status).toBe(409);
    expect(result.error).toBe("This product is no longer available to claim.");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("reuses a current duplicate claim without sending another email", async () => {
    const client = createSupabaseFake({ claimDisposition: "already_sent" });
    const sendEmail = vi.fn();
    vi.stubGlobal("fetch", sendEmail);

    const response = await createClaim(claimRequest());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toEqual({ ok: true, emailSent: false, reused: true });
    expect(client.rpcCalls.some((call) => call.name === "claim_free_product")).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("rejects claim bursts before creating another claim", async () => {
    const client = createSupabaseFake({ rateAllowed: false });
    const response = await createClaim(claimRequest());

    expect(response.status).toBe(429);
    expect(client.rpcCalls.some((call) => call.name === "claim_free_product")).toBe(false);
  });

  it("creates a short-lived signed URL only after recording an eligible download", async () => {
    const client = createSupabaseFake();
    const response = await requestDownload(new Request("https://cloverloop.test/api/free-product-download", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": "203.0.113.8" },
      body: JSON.stringify({ token }),
    }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.url).toContain("signed-file");
    expect(client.rpcCalls.find((call) => call.name === "record_free_product_download")?.args)
      .toEqual({
        requested_claim_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        requested_file_path: "creator/product/file.pdf",
      });
    expect(client.storage.from).toHaveBeenCalledWith("product-files");
  });

  it("rejects expired links before signing or counting a download", async () => {
    const client = createSupabaseFake({ claimExpiry: new Date(Date.now() - 1000).toISOString() });
    const response = await requestDownload(new Request("https://cloverloop.test/api/free-product-download", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": "203.0.113.8" },
      body: JSON.stringify({ token }),
    }));

    expect(response.status).toBe(410);
    expect(client.storage.from).not.toHaveBeenCalled();
    expect(client.rpcCalls.some((call) => call.name === "record_free_product_download")).toBe(false);
  });

  it("rejects exhausted links before signing another download", async () => {
    const client = createSupabaseFake({ downloadCount: 3, maxDownloads: 3 });
    const response = await requestDownload(new Request("https://cloverloop.test/api/free-product-download", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": "203.0.113.8" },
      body: JSON.stringify({ token }),
    }));

    expect(response.status).toBe(410);
    expect(client.storage.from).not.toHaveBeenCalled();
    expect(client.rpcCalls.some((call) => call.name === "record_free_product_download")).toBe(false);
  });
});
