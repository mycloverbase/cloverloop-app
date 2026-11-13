import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  ensureRazorpayAccountWebhook,
  type RazorpayCheckoutConnection,
} from "@/lib/razorpay/checkout";

const connection: RazorpayCheckoutConnection = {
  creatorId: "creator-a",
  accountId: "acc_ABC123",
  environment: "test",
  publicToken: "rzp_test_public",
  accessToken: "oauth-access-token-never-log",
};

const events = [
  "payment.authorized",
  "payment.failed",
  "payment.captured",
  "order.paid",
];

function webhook(id = "HK890egfiItP3h") {
  return {
    id,
    owner_id: "ABC123",
    url: "https://cloverloop.test/api/webhooks/razorpay",
    active: true,
    secret_exists: true,
    events,
  };
}

function makeAdmin(options?: {
  registration?: Record<string, unknown> | null;
  upsertError?: { message: string } | null;
  claim?: boolean;
}) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    upsert: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({
    data: options?.registration ?? null,
    error: null,
  });
  query.upsert.mockResolvedValue({ error: options?.upsertError ?? null });

  const rpc = vi.fn(async (name: string) => {
    if (name === "claim_razorpay_webhook_registration") {
      return { data: options?.claim ?? true, error: null };
    }
    return { data: null, error: null };
  });

  return {
    client: { from: vi.fn().mockReturnValue(query), rpc },
    query,
    rpc,
  };
}

function mockFetch(
  implementation: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(implementation as typeof fetch);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RAZORPAY_OAUTH_MODE", "test");
  vi.stubEnv("RAZORPAY_TEST_WEBHOOK_SECRET", "test-webhook-root-secret");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cloverloop.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ensureRazorpayAccountWebhook", () => {
  it("creates and persists the documented account webhook using Basic OAuth auth", async () => {
    const admin = makeAdmin();
    mocks.createSupabaseAdminClient.mockReturnValue(admin.client);
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    mockFetch(async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (init?.method === "GET") {
        return Response.json({ entity: "collection", count: 0, items: [] });
      }
      return Response.json(webhook(), { status: 200 });
    });

    await expect(ensureRazorpayAccountWebhook(connection)).resolves.toBe(true);

    expect(requests).toHaveLength(2);
    expect(requests[0].url).toBe(
      "https://api.razorpay.com/v2/accounts/acc_ABC123/webhooks",
    );
    expect(requests[1].url).toBe(requests[0].url);
    expect(requests[1].init?.method).toBe("POST");
    const headers = new Headers(requests[1].init?.headers);
    expect(headers.get("Authorization")).toBe(
      `Basic ${Buffer.from(`${connection.accessToken}:`).toString("base64")}`,
    );
    expect(headers.get("Authorization")).not.toContain("Bearer");
    expect(JSON.parse(String(requests[1].init?.body))).toEqual({
      url: "https://cloverloop.test/api/webhooks/razorpay",
      secret: "test-webhook-root-secret",
      events,
    });
    expect(admin.query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        creator_id: "creator-a",
        razorpay_account_id: "acc_ABC123",
        environment: "test",
        razorpay_webhook_id: "HK890egfiItP3h",
        webhook_url: "https://cloverloop.test/api/webhooks/razorpay",
        events,
        signing_secret_hash: expect.any(String),
      }),
      { onConflict: "creator_id,razorpay_account_id,environment" },
    );
    expect(admin.rpc).toHaveBeenCalledWith(
      "release_razorpay_webhook_registration",
      expect.objectContaining({
        p_creator_id: "creator-a",
        p_account_id: "acc_ABC123",
        p_environment: "test",
      }),
    );
  });

  it("logs sanitized Razorpay error fields for HTTP 400 without exposing secrets", async () => {
    const admin = makeAdmin();
    mocks.createSupabaseAdminClient.mockReturnValue(admin.client);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(async (_url, init) => {
      if (init?.method === "GET") {
        return Response.json({ items: [] });
      }
      return Response.json(
        {
          error: {
            code: "BAD_REQUEST_ERROR",
            description:
              "invalid access_token=oauth-access-token-never-log webhook_secret=test-webhook-root-secret",
            field: "Authorization",
            source: "business",
            reason: "invalid_credentials",
          },
        },
        { status: 400 },
      );
    });

    await expect(ensureRazorpayAccountWebhook(connection)).resolves.toBe(false);

    const serializedLogs = JSON.stringify(errorLog.mock.calls);
    expect(serializedLogs).toContain("BAD_REQUEST_ERROR");
    expect(serializedLogs).toContain("invalid_credentials");
    expect(serializedLogs).toContain("endpointPath");
    expect(serializedLogs).toContain("httpStatus");
    expect(serializedLogs).toContain("creator-a");
    expect(serializedLogs).toContain("acc_ABC123");
    expect(serializedLogs).toContain("test");
    expect(serializedLogs).not.toContain(connection.accessToken);
    expect(serializedLogs).not.toContain("test-webhook-root-secret");
    expect(admin.query.upsert).not.toHaveBeenCalled();
  });

  it("reports invalid OAuth credentials from Razorpay without persisting a registration", async () => {
    const admin = makeAdmin();
    mocks.createSupabaseAdminClient.mockReturnValue(admin.client);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(async (_url, init) =>
      init?.method === "GET"
        ? Response.json({ items: [] })
        : Response.json(
            {
              error: {
                code: "AUTHENTICATION_ERROR",
                description: "Invalid OAuth credentials",
                field: "Authorization",
                source: "auth",
                reason: "invalid_credentials",
              },
            },
            { status: 401 },
          ),
    );

    await expect(ensureRazorpayAccountWebhook(connection)).resolves.toBe(false);

    expect(JSON.stringify(errorLog.mock.calls)).toContain("AUTHENTICATION_ERROR");
    expect(JSON.stringify(errorLog.mock.calls)).toContain("httpStatus");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(connection.accessToken);
    expect(admin.query.upsert).not.toHaveBeenCalled();
  });

  it("reuses a verified active registration without creating a duplicate", async () => {
    const admin = makeAdmin({
      registration: {
        razorpay_webhook_id: "HK890egfiItP3h",
        webhook_url: "https://cloverloop.test/api/webhooks/razorpay",
      },
    });
    mocks.createSupabaseAdminClient.mockReturnValue(admin.client);
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    mockFetch(async (input, init) => {
      requests.push({ url: String(input), init });
      return Response.json(webhook());
    });

    await expect(ensureRazorpayAccountWebhook(connection)).resolves.toBe(true);

    expect(requests).toHaveLength(1);
    expect(requests[0].init?.method).toBe("GET");
    expect(admin.query.upsert).toHaveBeenCalledOnce();
    expect(admin.query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        creator_id: "creator-a",
        razorpay_account_id: "acc_ABC123",
        razorpay_webhook_id: "HK890egfiItP3h",
      }),
      expect.any(Object),
    );
  });

  it("does not call Razorpay when another request holds the registration lock", async () => {
    const admin = makeAdmin({ claim: false });
    mocks.createSupabaseAdminClient.mockReturnValue(admin.client);
    const fetch = mockFetch(async () => Response.json({}));

    await expect(ensureRazorpayAccountWebhook(connection)).resolves.toBe(false);

    expect(fetch).not.toHaveBeenCalled();
    expect(admin.query.upsert).not.toHaveBeenCalled();
    expect(admin.rpc).toHaveBeenCalledOnce();
  });

  it("rejects invalid URLs and Live connections before acquiring a lock", async () => {
    const admin = makeAdmin();
    mocks.createSupabaseAdminClient.mockReturnValue(admin.client);
    const fetch = mockFetch(async () => Response.json({}));

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://cloverloop.test");
    await expect(ensureRazorpayAccountWebhook(connection)).resolves.toBe(false);

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cloverloop.test");
    await expect(
      ensureRazorpayAccountWebhook({ ...connection, environment: "live" }),
    ).resolves.toBe(false);

    expect(admin.rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not persist a webhook after database persistence fails", async () => {
    const admin = makeAdmin({
      upsertError: { message: "database unavailable" },
    });
    mocks.createSupabaseAdminClient.mockReturnValue(admin.client);
    mockFetch(async (_url, init) =>
      init?.method === "GET"
        ? Response.json({ items: [] })
        : Response.json(webhook()),
    );

    await expect(ensureRazorpayAccountWebhook(connection)).resolves.toBe(false);
    expect(admin.query.upsert).toHaveBeenCalledOnce();
  });

  it("does not persist a registration belonging to a different account", async () => {
    const admin = makeAdmin();
    mocks.createSupabaseAdminClient.mockReturnValue(admin.client);
    mockFetch(async (_url, init) =>
      init?.method === "GET"
        ? Response.json({ items: [] })
        : Response.json({ ...webhook(), owner_id: "OTHER" }),
    );

    await expect(ensureRazorpayAccountWebhook(connection)).resolves.toBe(false);
    expect(admin.query.upsert).not.toHaveBeenCalled();
  });

  it("persists registrations only under the connected creator and account", async () => {
    const admin = makeAdmin();
    mocks.createSupabaseAdminClient.mockReturnValue(admin.client);
    const otherCreator = {
      ...connection,
      creatorId: "creator-b",
      accountId: "acc_DEF456",
    };
    mockFetch(async (input, init) => {
      if (init?.method === "GET") return Response.json({ items: [] });
      return Response.json({
        ...webhook(),
        owner_id: "DEF456",
        url: "https://cloverloop.test/api/webhooks/razorpay",
      });
    });

    await expect(ensureRazorpayAccountWebhook(otherCreator)).resolves.toBe(true);

    expect(admin.query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        creator_id: "creator-b",
        razorpay_account_id: "acc_DEF456",
        environment: "test",
      }),
      expect.any(Object),
    );
  });

  it("does not reuse a remote webhook after the signing secret was rotated", async () => {
    const admin = makeAdmin({
      registration: {
        razorpay_webhook_id: "HK890egfiItP3h",
        webhook_url: "https://cloverloop.test/api/webhooks/razorpay",
        signing_secret_hash: "previous-secret-hash",
      },
    });
    mocks.createSupabaseAdminClient.mockReturnValue(admin.client);
    const fetch = mockFetch(async () => Response.json(webhook()));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(ensureRazorpayAccountWebhook(connection)).resolves.toBe(false);

    expect(fetch).not.toHaveBeenCalled();
    expect(admin.query.upsert).not.toHaveBeenCalled();
    expect(JSON.stringify(errorLog.mock.calls)).toContain("signing secret changed");
  });

  it("does not register Live or wrong-creator account configuration", async () => {
    const admin = makeAdmin();
    mocks.createSupabaseAdminClient.mockReturnValue(admin.client);
    const fetch = mockFetch(async () => Response.json({}));

    vi.stubEnv("RAZORPAY_OAUTH_MODE", "live");
    await expect(ensureRazorpayAccountWebhook(connection)).resolves.toBe(false);

    expect(fetch).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});
