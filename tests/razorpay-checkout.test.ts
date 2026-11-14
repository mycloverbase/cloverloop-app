import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  decryptRazorpayToken: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/razorpay/oauth", () => ({
  decryptRazorpayToken: mocks.decryptRazorpayToken,
}));

import {
  getFreeProductDeliveryConfig,
  isRazorpayPartnerWebhookDiagnosticsEnabled,
  getRazorpayCheckoutConnection,
  hashCheckoutToken,
  isRazorpayCheckoutEnabled,
  isValidCheckoutToken,
  normalizeCustomerEmail,
  verifyRazorpayWebhookSignature,
} from "@/lib/razorpay/checkout";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Razorpay checkout helpers", () => {
  it("requires the explicit checkout flag", () => {
    vi.stubEnv("RAZORPAY_CHECKOUT_ENABLED", "true");
    expect(isRazorpayCheckoutEnabled()).toBe(true);

    vi.stubEnv("RAZORPAY_CHECKOUT_ENABLED", "false");
    expect(isRazorpayCheckoutEnabled()).toBe(false);
    vi.stubEnv("RAZORPAY_CHECKOUT_ENABLED", "1");
    expect(isRazorpayCheckoutEnabled()).toBe(false);
  });

  it("enables partner webhook diagnostics only with a distinct Test Mode secret and explicit flag", () => {
    vi.stubEnv("RAZORPAY_OAUTH_MODE", "test");
    vi.stubEnv("RAZORPAY_PARTNER_WEBHOOK_DIAGNOSTICS", "true");
    vi.stubEnv("RAZORPAY_PARTNER_TEST_WEBHOOK_SECRET", "partner-secret");
    vi.stubEnv("RAZORPAY_TEST_WEBHOOK_SECRET", "account-secret");
    expect(isRazorpayPartnerWebhookDiagnosticsEnabled()).toBe(true);

    vi.stubEnv("RAZORPAY_PARTNER_WEBHOOK_DIAGNOSTICS", "false");
    expect(isRazorpayPartnerWebhookDiagnosticsEnabled()).toBe(false);

    vi.stubEnv("RAZORPAY_PARTNER_WEBHOOK_DIAGNOSTICS", "true");
    vi.stubEnv("RAZORPAY_OAUTH_MODE", "live");
    expect(isRazorpayPartnerWebhookDiagnosticsEnabled()).toBe(false);

    vi.stubEnv("RAZORPAY_OAUTH_MODE", "test");
    vi.stubEnv("RAZORPAY_TEST_WEBHOOK_SECRET", "partner-secret");
    expect(isRazorpayPartnerWebhookDiagnosticsEnabled()).toBe(false);
  });

  it("hashes and validates opaque checkout tokens without accepting short values", () => {
    const token = "85ab1e94-38c3-4f4f-a20d-fc2f9192b33e";
    expect(isValidCheckoutToken(token)).toBe(true);
    expect(isValidCheckoutToken("short")).toBe(false);
    expect(hashCheckoutToken(token)).toHaveLength(64);
    expect(hashCheckoutToken(token)).toBe(hashCheckoutToken(token));
  });

  it("normalizes buyer email and rejects malformed addresses", () => {
    expect(normalizeCustomerEmail(" Buyer@Example.COM ")).toBe(
      "buyer@example.com",
    );
    expect(normalizeCustomerEmail("not-an-email")).toBeNull();
    expect(normalizeCustomerEmail("a".repeat(250) + "@example.com")).toBeNull();
  });

  it("uses the established free-product delivery limits and rejects invalid settings", () => {
    vi.stubEnv("FREE_PRODUCT_MAX_DOWNLOADS", "4");
    vi.stubEnv("FREE_PRODUCT_LINK_EXPIRY_HOURS", "72");
    expect(getFreeProductDeliveryConfig()).toEqual({
      maxDownloads: 4,
      expiryHours: 72,
    });

    vi.stubEnv("FREE_PRODUCT_MAX_DOWNLOADS", "21");
    expect(getFreeProductDeliveryConfig()).toBeNull();
  });

  it("checks webhook signatures with constant-time HMAC comparison", () => {
    const body = '{"event":"payment.captured"}';
    const secret = "test-webhook-secret";
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    expect(verifyRazorpayWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyRazorpayWebhookSignature(body, "0".repeat(64), secret)).toBe(
      false,
    );
    expect(verifyRazorpayWebhookSignature(body, null, secret)).toBe(false);
  });

  it("does not decrypt a connection belonging to a different creator", async () => {
    vi.stubEnv("RAZORPAY_OAUTH_ENABLED", "true");
    vi.stubEnv("RAZORPAY_OAUTH_MODE", "test");
    vi.stubEnv("RAZORPAY_OAUTH_CLIENT_ID", "development-client");

    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          creator_id: "creator-b",
          razorpay_account_id: "account-b",
          client_id: "development-client",
          environment: "test",
          public_token: "rzp_test_public",
          access_token_encrypted: "ciphertext",
          token_expires_at: null,
          connection_status: "connected",
        },
        error: null,
      }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue(query),
    });

    await expect(getRazorpayCheckoutConnection("creator-a")).resolves.toBeNull();
    expect(query.eq).toHaveBeenCalledWith("creator_id", "creator-a");
    expect(mocks.decryptRazorpayToken).not.toHaveBeenCalled();
  });

  it("decrypts only the connected creator's Test Mode access token for the configured OAuth client", async () => {
    vi.stubEnv("RAZORPAY_OAUTH_ENABLED", "true");
    vi.stubEnv("RAZORPAY_OAUTH_MODE", "test");
    vi.stubEnv("RAZORPAY_OAUTH_CLIENT_ID", "development-client");

    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          creator_id: "creator-a",
          razorpay_account_id: "acc_ABC123",
          client_id: "development-client",
          environment: "test",
          public_token: "rzp_test_public",
          access_token_encrypted: "encrypted-access",
          token_expires_at: "2099-01-01T00:00:00.000Z",
          connection_status: "connected",
        },
        error: null,
      }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue(query),
    });
    mocks.decryptRazorpayToken.mockReturnValue("decrypted-test-access");

    await expect(getRazorpayCheckoutConnection("creator-a")).resolves.toEqual({
      creatorId: "creator-a",
      accountId: "acc_ABC123",
      environment: "test",
      publicToken: "rzp_test_public",
      accessToken: "decrypted-test-access",
    });
    expect(query.eq).toHaveBeenCalledWith("creator_id", "creator-a");
    expect(query.eq).toHaveBeenCalledWith("environment", "test");
    expect(query.eq).toHaveBeenCalledWith("connection_status", "connected");
    expect(mocks.decryptRazorpayToken).toHaveBeenCalledWith(
      "encrypted-access",
      "creator-a",
      "access",
    );
  });

  it("rejects a Live connection even when the query mock returns it", async () => {
    vi.stubEnv("RAZORPAY_OAUTH_ENABLED", "true");
    vi.stubEnv("RAZORPAY_OAUTH_MODE", "test");
    vi.stubEnv("RAZORPAY_OAUTH_CLIENT_ID", "development-client");

    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          creator_id: "creator-a",
          razorpay_account_id: "account-a",
          client_id: "development-client",
          environment: "live",
          public_token: "rzp_live_public",
          access_token_encrypted: "ciphertext",
          token_expires_at: null,
          connection_status: "connected",
        },
        error: null,
      }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue(query),
    });

    await expect(getRazorpayCheckoutConnection("creator-a")).resolves.toBeNull();
    expect(mocks.decryptRazorpayToken).not.toHaveBeenCalled();
  });
});
