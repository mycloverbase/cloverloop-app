import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInstagramOAuthState,
  decryptInstagramToken,
  encryptInstagramToken,
  exchangeForLongLivedInstagramToken,
  exchangeInstagramAuthorizationCode,
  getInstagramCommentDetails,
  getInstagramProfile,
  getMatchedInstagramKeyword,
  isInstagramAuthorizationError,
  isInstagramCommentEligible,
  parseInstagramCommentNotifications,
  selectMatchingInstagramAutomation,
  sendInstagramPrivateReply,
  subscribeInstagramComments,
  verifyInstagramOAuthState,
  verifyInstagramWebhookSignature,
} from "@/lib/instagram/server";
import { parseInstagramAutomationInput } from "@/lib/instagram/validation";

vi.mock("server-only", () => ({}));

const originalEnv = {
  appId: process.env.META_INSTAGRAM_APP_ID,
  appSecret: process.env.META_INSTAGRAM_APP_SECRET,
  verifyToken: process.env.META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
  graphVersion: process.env.META_GRAPH_API_VERSION,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  encryptionKey: process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY,
};

function configureInstagram() {
  process.env.META_INSTAGRAM_APP_ID = "test-app-id";
  process.env.META_INSTAGRAM_APP_SECRET = "test-app-secret";
  process.env.META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN = "test-verify-token";
  process.env.META_GRAPH_API_VERSION = "v99.0";
  process.env.NEXT_PUBLIC_SITE_URL = "https://cloverloop.test";
  process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
}

afterEach(() => {
  const entries = [
    ["META_INSTAGRAM_APP_ID", originalEnv.appId],
    ["META_INSTAGRAM_APP_SECRET", originalEnv.appSecret],
    ["META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN", originalEnv.verifyToken],
    ["META_GRAPH_API_VERSION", originalEnv.graphVersion],
    ["NEXT_PUBLIC_SITE_URL", originalEnv.siteUrl],
    ["INSTAGRAM_TOKEN_ENCRYPTION_KEY", originalEnv.encryptionKey],
  ] as const;
  for (const [key, value] of entries) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
});

describe("Instagram OAuth and token protection", () => {
  it("accepts only signed, unexpired state for the same creator", () => {
    configureInstagram();
    const now = 1_800_000_000_000;
    const signed = createInstagramOAuthState("creator-id", now);
    expect(verifyInstagramOAuthState(signed.state, signed.cookieValue, "creator-id", now)).toBe(true);
    expect(verifyInstagramOAuthState(signed.state, signed.cookieValue, "another-creator", now)).toBe(false);
    expect(verifyInstagramOAuthState(`${signed.state}x`, signed.cookieValue, "creator-id", now)).toBe(false);
    expect(verifyInstagramOAuthState(signed.state, signed.cookieValue, "creator-id", now + 11 * 60 * 1000)).toBe(false);
    expect(verifyInstagramOAuthState(signed.state, `${signed.cookieValue}x`, "creator-id", now)).toBe(false);
  });

  it("encrypts tokens and rejects tampering", () => {
    configureInstagram();
    const encrypted = encryptInstagramToken("sensitive-instagram-token");
    expect(encrypted).not.toContain("sensitive-instagram-token");
    expect(decryptInstagramToken(encrypted)).toBe("sensitive-instagram-token");
    expect(() => decryptInstagramToken(`${encrypted}x`)).toThrow();
  });
});

describe("Instagram webhook and matching", () => {
  it("validates signatures and parses only comment events", () => {
    const body = JSON.stringify({
      object: "instagram",
      entry: [{
        id: "ig-account",
        time: 1_800_000_000,
        field: "comments",
        value: { id: "comment-1", from: { id: "commenter-1" }, text: "Guide please", media: { id: "media-1" } },
      }, {
        id: "ig-account",
        time: 1_800_000_000,
        changes: [
          { field: "live_comments", value: { id: "live-comment", media: { id: "live-media" } } },
        ],
      }],
    });
    const signature = `sha256=${createHmac("sha256", "test-secret").update(body).digest("hex")}`;
    expect(verifyInstagramWebhookSignature(body, signature, "test-secret")).toBe(true);
    expect(verifyInstagramWebhookSignature(body, signature, "wrong-secret")).toBe(false);
    expect(verifyInstagramWebhookSignature(body, "sha256=bad", "test-secret")).toBe(false);
    expect(parseInstagramCommentNotifications(JSON.parse(body))).toEqual([{
      instagramUserId: "ig-account",
      commentId: "comment-1",
      mediaId: "media-1",
      commenterId: "commenter-1",
      text: "Guide please",
      timestamp: null,
    }]);
  });

  it("matches case-insensitively at whole-word boundaries and picks one oldest automation", () => {
    expect(getMatchedInstagramKeyword("Please send me the guide", ["GUIDE"], "whole_word")).toBe("GUIDE");
    expect(getMatchedInstagramKeyword("GUIDE", ["guide"], "whole_word")).toBe("guide");
    expect(getMatchedInstagramKeyword("GUIDELINE", ["GUIDE"], "whole_word")).toBeNull();
    expect(getMatchedInstagramKeyword("please guide me", ["GUIDE"], "exact_comment")).toBeNull();
    expect(getMatchedInstagramKeyword(" guide ", ["GUIDE"], "exact_comment")).toBe("GUIDE");

    const result = selectMatchingInstagramAutomation("guide please", [
      { id: "new", status: "active", created_at: "2026-01-02", trigger_keywords: ["GUIDE"], match_type: "whole_word" },
      { id: "paused", status: "paused", created_at: "2025-01-01", trigger_keywords: ["GUIDE"], match_type: "whole_word" },
      { id: "old", status: "active", created_at: "2026-01-01", trigger_keywords: ["GUIDE", "PDF"], match_type: "whole_word" },
    ]);
    expect(result?.automation.id).toBe("old");
    expect(result?.keyword).toBe("GUIDE");
  });

  it("enforces Meta's seven-day private-reply window", () => {
    const now = 1_800_000_000_000;
    expect(isInstagramCommentEligible(new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(), now)).toBe(true);
    expect(isInstagramCommentEligible(new Date(now - 7 * 24 * 60 * 60 * 1000 - 1).toISOString(), now)).toBe(false);
    expect(isInstagramCommentEligible(new Date(now + 2 * 60 * 1000).toISOString(), now)).toBe(false);
    expect(isInstagramCommentEligible("not-a-date", now)).toBe(false);
  });
});

describe("Instagram automation input and Meta messaging", () => {
  it("rejects malformed or unsafe automation input", () => {
    const valid = {
      connectionId: "0a000000-0000-4000-8000-000000000001",
      name: "Guide reply",
      mediaId: "media-1",
      mediaType: "VIDEO",
      mediaPermalink: "https://www.instagram.com/reel/example/",
      mediaCaption: "",
      keywords: ["GUIDE", "PDF"],
      matchType: "whole_word",
      replyMessage: "Thanks for your interest!",
      targetProductId: null,
      status: "active",
    };
    expect(parseInstagramAutomationInput(valid).ok).toBe(true);
    expect(parseInstagramAutomationInput({ ...valid, mediaType: "LIVE" }).ok).toBe(false);
    expect(parseInstagramAutomationInput({ ...valid, keywords: ["guide", " GUIDE "] }).ok).toBe(false);
    expect(parseInstagramAutomationInput({ ...valid, replyMessage: "Visit https://evil.example" }).ok).toBe(false);
    expect(parseInstagramAutomationInput({ ...valid, mediaPermalink: "https://evil.example/post" }).ok).toBe(false);
  });

  it("reads the comment's real creation time from the mocked Meta API", async () => {
    configureInstagram();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      timestamp: "2026-11-12T10:00:00+0000",
      text: "GUIDE",
      from: { id: "commenter-id" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const details = await getInstagramCommentDetails("comment-1", "mock-token");
    expect(details.timestamp).toBe("2026-11-12T10:00:00.000Z");
    expect(details.commenterId).toBe("commenter-id");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v99.0/comment-1?");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("mock-token");
  });

  it("exchanges mocked authorization for a long-lived token and validates a professional profile", async () => {
    configureInstagram();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "short-token",
        user_id: "ig-account-id",
        permissions: "instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "long-token", expires_in: 5_184_000 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user_id: "ig-account-id",
        username: "creator",
        account_type: "Business",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      appId: "test-app-id",
      appSecret: "test-app-secret",
      webhookVerifyToken: "test-verify-token",
      graphApiVersion: "v99.0",
      redirectUri: "https://cloverloop.test/api/instagram/callback",
    };
    const shortToken = await exchangeInstagramAuthorizationCode("mock-code", config);
    const longToken = await exchangeForLongLivedInstagramToken(shortToken.shortLivedToken, config);
    const profile = await getInstagramProfile(longToken.accessToken);
    await subscribeInstagramComments(profile.userId, longToken.accessToken);
    expect(shortToken.grantedScopes).toHaveLength(3);
    expect(longToken.expiresIn).toBe(5_184_000);
    expect(profile).toEqual({ userId: "ig-account-id", username: "creator", accountType: "Business" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.instagram.com/oauth/access_token");
    expect(String(fetchMock.mock.calls[3][0])).toContain("/v99.0/ig-account-id/subscribed_apps?subscribed_fields=comments");
  });

  it("rejects expired or invalid authorization exchanges", async () => {
    configureInstagram();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error_type: "OAuthException",
      error_message: "Code has expired",
    }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(exchangeInstagramAuthorizationCode("expired-code", {
      appId: "test-app-id",
      appSecret: "test-app-secret",
      webhookVerifyToken: "test-verify-token",
      graphApiVersion: "v99.0",
      redirectUri: "https://cloverloop.test/api/instagram/callback",
    })).rejects.toThrow("Instagram authorization could not be exchanged.");
  });

  it("recognizes token revocation as a permanent authorization failure", async () => {
    configureInstagram();
    for (const result of [
      { status: 401, code: 190 },
      { status: 403, code: 10 },
      { status: 400, code: 190 },
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: { code: result.code, message: "Authorization revoked" },
      }), { status: result.status })));
      let caught: unknown;
      try {
        await getInstagramProfile("revoked-token");
      } catch (error) {
        caught = error;
      }
      expect(isInstagramAuthorizationError(caught)).toBe(true);
    }
  });

  it("sends a private reply with the comment ID and distinguishes permanent and retryable Meta errors", async () => {
    configureInstagram();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ recipient_id: "person", message_id: "message-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 10, message: "Permission denied" } }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 4, message: "Rate limit" } }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 2, message: "Temporary failure", is_transient: true } }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const messageId = await sendInstagramPrivateReply("creator-ig-id", "comment-42", "mock-token", "Thanks!");
    expect(messageId).toBe("message-1");
    const firstCall = fetchMock.mock.calls[0];
    expect(String(firstCall[0])).toContain("/v99.0/creator-ig-id/messages");
    expect(JSON.parse(String(firstCall[1]?.body))).toEqual({
      recipient: { comment_id: "comment-42" },
      message: { text: "Thanks!" },
    });
    await expect(sendInstagramPrivateReply("creator-ig-id", "comment-43", "mock-token", "Thanks!"))
      .rejects.toMatchObject({ status: 403, retryable: false });
    await expect(sendInstagramPrivateReply("creator-ig-id", "comment-44", "mock-token", "Thanks!"))
      .rejects.toMatchObject({ status: 429, retryable: true });
    await expect(sendInstagramPrivateReply("creator-ig-id", "comment-45", "mock-token", "Thanks!"))
      .rejects.toMatchObject({ status: 500, retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
