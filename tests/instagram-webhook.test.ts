import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkInstagramRateLimit } from "@/lib/instagram/auth";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  accountRows: [] as Array<{ id: string; creator_id: string; instagram_user_id: string }>,
  eventKeys: [] as string[],
  upsertOptions: null as { onConflict: string; ignoreDuplicates: boolean } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/instagram/auth", () => ({
  checkInstagramRateLimit: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/supabase/admin", () => {
  class FakeQuery {
    constructor(private readonly table: string) {}

    select() { return this; }
    eq() { return this; }
    in() { return this; }

    upsert(rows: Array<{
      instagram_connection_id: string;
      instagram_comment_id: string;
    }>, options: { onConflict: string; ignoreDuplicates: boolean }) {
      mocks.upsertOptions = options;
      for (const row of rows) {
        const key = `${row.instagram_connection_id}:${row.instagram_comment_id}`;
        if (!mocks.eventKeys.includes(key)) mocks.eventKeys.push(key);
      }
      return this;
    }

    then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      const result = {
        data: this.table === "instagram_connections" ? mocks.accountRows : null,
        error: null,
      };
      return Promise.resolve(result).then(onfulfilled, onrejected);
    }
  }
  return {
    createSupabaseAdminClient: () => ({
      from: (table: string) => new FakeQuery(table),
    }),
  };
});

import { GET, POST } from "@/app/api/instagram/webhook/route";

const originalEnv = {
  appId: process.env.META_INSTAGRAM_APP_ID,
  appSecret: process.env.META_INSTAGRAM_APP_SECRET,
  verifyToken: process.env.META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
  graphVersion: process.env.META_GRAPH_API_VERSION,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
};

function signedRequest(payload: unknown, secret: string) {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  return new Request("https://cloverloop.test/api/instagram/webhook", {
    method: "POST",
    headers: { "x-hub-signature-256": `sha256=${signature}` },
    body,
  });
}

beforeEach(() => {
  vi.mocked(checkInstagramRateLimit).mockResolvedValue(true);
  process.env.META_INSTAGRAM_APP_ID = "test-app-id";
  process.env.META_INSTAGRAM_APP_SECRET = "test-app-secret";
  process.env.META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN = "test-verify-token";
  process.env.META_GRAPH_API_VERSION = "v99.0";
  process.env.NEXT_PUBLIC_SITE_URL = "https://cloverloop.test";
  mocks.accountRows = [{ id: "connection-1", creator_id: "creator-1", instagram_user_id: "ig-account-1" }];
  mocks.eventKeys = [];
  mocks.upsertOptions = null;
});

afterEach(() => {
  const entries = [
    ["META_INSTAGRAM_APP_ID", originalEnv.appId],
    ["META_INSTAGRAM_APP_SECRET", originalEnv.appSecret],
    ["META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN", originalEnv.verifyToken],
    ["META_GRAPH_API_VERSION", originalEnv.graphVersion],
    ["NEXT_PUBLIC_SITE_URL", originalEnv.siteUrl],
  ] as const;
  for (const [key, value] of entries) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Instagram webhook handler", () => {
  it("responds to Meta's verification challenge only with the configured verify token", async () => {
    const challenge = "challenge-value";
    const valid = await GET(new NextRequest(
      `https://cloverloop.test/api/instagram/webhook?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=${challenge}`,
    ));
    const invalid = await GET(new NextRequest(
      `https://cloverloop.test/api/instagram/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=${challenge}`,
    ));
    expect(valid.status).toBe(200);
    await expect(valid.text()).resolves.toBe(challenge);
    expect(invalid.status).toBe(403);
  });

  it("verifies signatures, ignores unconnected accounts, and deduplicates repeated comment deliveries", async () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "ig-account-1",
          time: 1_800_000_000,
          changes: [{
            field: "comments",
            value: { id: "comment-1", from: { id: "commenter-1" }, text: "GUIDE", media: { id: "media-1" } },
          }],
        },
        {
          id: "unknown-account",
          time: 1_800_000_000,
          changes: [{
            field: "comments",
            value: { id: "comment-2", from: { id: "commenter-2" }, text: "GUIDE", media: { id: "media-2" } },
          }],
        },
      ],
    };

    const first = await POST(signedRequest(payload, "test-app-secret"));
    const second = await POST(signedRequest(payload, "test-app-secret"));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mocks.upsertOptions).toEqual({
      onConflict: "instagram_connection_id,instagram_comment_id",
      ignoreDuplicates: true,
    });
    expect(mocks.eventKeys).toEqual(["connection-1:comment-1"]);
  });

  it("rejects invalid signatures before writing events", async () => {
    const body = JSON.stringify({ object: "instagram", entry: [] });
    const response = await POST(new Request("https://cloverloop.test/api/instagram/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=00" },
      body,
    }));
    expect(response.status).toBe(401);
    expect(mocks.upsertOptions).toBeNull();
  });
});
