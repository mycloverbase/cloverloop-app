import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

import { GET as razorpayCallback } from "@/app/api/razorpay/callback/route";
import { GET as refreshRazorpayTokens } from "@/app/api/cron/razorpay-token-refresh/route";
import {
  createRazorpayOAuthState,
  decryptRazorpayToken,
  encryptRazorpayToken,
  exchangeRazorpayAuthorizationCode,
  getRazorpayOAuthConfig,
  getRazorpayOAuthReadiness,
  isRazorpayConnectionUsable,
  refreshRazorpayTokenPair,
} from "@/lib/razorpay/oauth";

const creatorId = "f0991ad4-a6a1-4bc8-9dd7-2c2bf8e1db49";
const merchantAccountId = "acc_testMerchant123";

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    token_type: "Bearer",
    access_token: "private-access-token",
    refresh_token: "private-refresh-token",
    public_token: "rzp_test_oauth_public",
    expires_in: 7_862_400,
    razorpay_account_id: merchantAccountId,
    ...overrides,
  };
}

function createSupabaseFakes(options: {
  stateValid?: boolean;
  agreementAccepted?: boolean;
  existingStatus?: string | null;
  refreshClaims?: unknown[];
} = {}) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const auditRows: Record<string, unknown>[] = [];
  const admin = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "consume_razorpay_oauth_state") {
        return {
          data: options.stateValid === false ? [] : [{
            creator_id: creatorId,
            client_id: "razorpay-test-client",
            environment: "test",
          }],
          error: null,
        };
      }
      if (name === "save_razorpay_connection") return { data: true, error: null };
      if (name === "claim_razorpay_token_refresh") {
        return { data: options.refreshClaims ?? [], error: null };
      }
      if (name === "finish_razorpay_token_refresh") return { data: true, error: null };
      if (name === "fail_razorpay_token_refresh") return { data: true, error: null };
      return { data: null, error: null };
    }),
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => ({
          data: table === "creator_razorpay_connections" && options.existingStatus
            ? { connection_status: options.existingStatus }
            : null,
          error: null,
        })),
        insert: vi.fn(async (values: Record<string, unknown>) => {
          if (table === "razorpay_connection_audit") auditRows.push(values);
          return { data: null, error: null };
        }),
      };
      return builder;
    }),
    rpcCalls,
    auditRows,
  };
  mocks.createSupabaseAdminClient.mockReturnValue(admin);
  mocks.createSupabaseServerClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: creatorId } }, error: null })),
    },
    rpc: vi.fn(async () => ({
      data: [{ accepted: options.agreementAccepted ?? true }],
      error: null,
    })),
  });
  return admin;
}

function configureRazorpayOAuth() {
  vi.stubEnv("RAZORPAY_OAUTH_ENABLED", "true");
  vi.stubEnv("RAZORPAY_OAUTH_CLIENT_ID", "razorpay-test-client");
  vi.stubEnv("RAZORPAY_OAUTH_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("RAZORPAY_OAUTH_MODE", "test");
  vi.stubEnv("RAZORPAY_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cloverloop.test");
}

function callbackRequest(state: string) {
  return new NextRequest(
    `https://cloverloop.test/api/razorpay/callback?state=${encodeURIComponent(state)}&code=sample%2Bcode`,
  );
}

describe("Razorpay OAuth configuration and token protection", () => {
  beforeEach(() => {
    configureRazorpayOAuth();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("keeps OAuth unavailable unless it is explicitly enabled and fully configured", () => {
    vi.stubEnv("RAZORPAY_OAUTH_ENABLED", "false");
    expect(getRazorpayOAuthReadiness().available).toBe(false);
    vi.stubEnv("RAZORPAY_OAUTH_ENABLED", "true");
    expect(getRazorpayOAuthConfig()?.environment).toBe("test");
    vi.stubEnv("RAZORPAY_OAUTH_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://cloverloop.test");
    expect(getRazorpayOAuthReadiness().available).toBe(false);
  });

  it("encrypts tokens with creator and purpose binding and rejects tampering", () => {
    const encrypted = encryptRazorpayToken("private-token", creatorId, "access");
    expect(encrypted).not.toContain("private-token");
    expect(decryptRazorpayToken(encrypted, creatorId, "access")).toBe("private-token");
    expect(() => decryptRazorpayToken(encrypted, "another-creator", "access")).toThrow();
    expect(() => decryptRazorpayToken(encrypted, creatorId, "refresh")).toThrow();
    expect(() => decryptRazorpayToken(`${encrypted}x`, creatorId, "access")).toThrow();
  });

  it("creates random state whose stored representation is only its SHA-256 digest", () => {
    const { state, stateHash } = createRazorpayOAuthState();
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(stateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stateHash).not.toBe(state);
  });

  it("treats expired and revoked connections as unusable", () => {
    const now = Date.now();
    expect(isRazorpayConnectionUsable("connected", new Date(now + 60_000).toISOString(), now)).toBe(true);
    expect(isRazorpayConnectionUsable("connected", new Date(now - 1).toISOString(), now)).toBe(false);
    expect(isRazorpayConnectionUsable("revoked", new Date(now + 60_000).toISOString(), now)).toBe(false);
    expect(isRazorpayConnectionUsable("reconnect_required", new Date(now + 60_000).toISOString(), now)).toBe(false);
  });

  it("exchanges the decoded authorization code server-side and requires a merchant account ID", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe("https://auth.razorpay.com/token");
      expect(init?.method).toBe("POST");
      return Response.json(tokenResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const config = getRazorpayOAuthConfig();
    if (!config) throw new Error("OAuth test configuration was not created.");

    const tokens = await exchangeRazorpayAuthorizationCode("sample+code", config);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, string>;

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://auth.razorpay.com/token");
    expect(body).toEqual({
      client_id: "razorpay-test-client",
      client_secret: "test-client-secret",
      grant_type: "authorization_code",
      redirect_uri: "https://cloverloop.test/api/razorpay/callback",
      code: "sample+code",
      mode: "test",
    });
    expect(tokens.accountId).toBe(merchantAccountId);
  });

  it("uses Razorpay's rotating refresh-token grant and surfaces provider failures", async () => {
    const config = getRazorpayOAuthConfig();
    if (!config) throw new Error("OAuth test configuration was not created.");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe("https://auth.razorpay.com/token");
      expect(init?.method).toBe("POST");
      return Response.json(tokenResponse({ razorpay_account_id: undefined }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await refreshRazorpayTokenPair("old-refresh-token", config);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, string>;
    expect(body).toEqual({
      client_id: "razorpay-test-client",
      client_secret: "test-client-secret",
      grant_type: "refresh_token",
      refresh_token: "old-refresh-token",
    });
    expect(tokens.accountId).toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 })));
    await expect(refreshRazorpayTokenPair("revoked-refresh-token", config))
      .rejects.toMatchObject({ status: 400 });
  });
});

describe("Razorpay OAuth callback and scheduled refresh", () => {
  beforeEach(() => {
    configureRazorpayOAuth();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("connects the authenticated creator and persists only encrypted private tokens", async () => {
    const admin = createSupabaseFakes();
    const fetchMock = vi.fn(async () =>
      Response.json(tokenResponse()));
    vi.stubGlobal("fetch", fetchMock);

    const response = await razorpayCallback(callbackRequest("A".repeat(43)));
    const location = new URL(response.headers.get("location") ?? "https://invalid.example");
    const saveCall = admin.rpcCalls.find((call) => call.name === "save_razorpay_connection");

    expect(location.searchParams.get("razorpay")).toBe("connected");
    expect(saveCall?.args.requested_creator_id).toBe(creatorId);
    expect(saveCall?.args.requested_razorpay_account_id).toBe(merchantAccountId);
    expect(saveCall?.args.requested_access_token_encrypted).not.toBe("private-access-token");
    expect(saveCall?.args.requested_refresh_token_encrypted).not.toBe("private-refresh-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid or replayed OAuth state before exchanging a code", async () => {
    createSupabaseFakes({ stateValid: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await razorpayCallback(callbackRequest("B".repeat(43)));
    const location = new URL(response.headers.get("location") ?? "https://invalid.example");

    expect(location.searchParams.get("razorpay")).toBe("state-error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not complete OAuth when the creator has not accepted the agreement", async () => {
    const admin = createSupabaseFakes({ agreementAccepted: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await razorpayCallback(callbackRequest("D".repeat(43)));
    const location = new URL(response.headers.get("location") ?? "https://invalid.example");

    expect(location.pathname).toBe("/creator-agreement/accept");
    expect(location.searchParams.get("next")).toBe("/dashboard/settings");
    expect(admin.rpcCalls.some((call) => call.name === "save_razorpay_connection")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not create a connection when the OAuth code exchange fails", async () => {
    const admin = createSupabaseFakes();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () =>
      Response.json({ error: "invalid_grant" }, { status: 400 })));

    const response = await razorpayCallback(callbackRequest("C".repeat(43)));
    const location = new URL(response.headers.get("location") ?? "https://invalid.example");

    expect(location.searchParams.get("razorpay")).toBe("exchange-error");
    expect(admin.rpcCalls.some((call) => call.name === "save_razorpay_connection")).toBe(false);
    expect(admin.auditRows).toContainEqual(expect.objectContaining({
      creator_id: creatorId,
      action: "connection_attempt_failed",
      error_code: "http_400",
    }));
  });

  it("refreshes the creator's token pair under a lock and stores the rotated pair", async () => {
    const encryptedRefreshToken = encryptRazorpayToken("existing-refresh-token", creatorId, "refresh");
    const admin = createSupabaseFakes({
      refreshClaims: [{
        creator_id: creatorId,
        environment: "test",
        encrypted_refresh_token: encryptedRefreshToken,
        lock_token: "b50534d0-0182-4c73-bdac-24dd574d8ff6",
      }],
    });
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    const fetchMock = vi.fn(async () =>
      Response.json(tokenResponse({
        access_token: "rotated-access-token",
        refresh_token: "rotated-refresh-token",
        razorpay_account_id: undefined,
      })));
    vi.stubGlobal("fetch", fetchMock);

    const response = await refreshRazorpayTokens(new Request("https://cloverloop.test/api/cron/razorpay-token-refresh", {
      headers: { authorization: "Bearer test-cron-secret" },
    }));
    const result = await response.json() as Record<string, number>;
    const finishCall = admin.rpcCalls.find((call) => call.name === "finish_razorpay_token_refresh");

    expect(result).toEqual({ refreshed: 1, failed: 0, reconnectRequired: 0 });
    expect(finishCall?.args.requested_creator_id).toBe(creatorId);
    expect(finishCall?.args.requested_lock_token).toBe("b50534d0-0182-4c73-bdac-24dd574d8ff6");
    expect(finishCall?.args.requested_access_token_encrypted).not.toBe("rotated-access-token");
    expect(finishCall?.args.requested_refresh_token_encrypted).not.toBe("rotated-refresh-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
