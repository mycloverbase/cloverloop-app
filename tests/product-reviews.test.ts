import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { POST as invitationRoute } from "@/app/api/reviews/invitation/route";
import { POST as submitRoute } from "@/app/api/reviews/submit/route";
import { POST as resendWebhook } from "@/app/api/webhooks/resend/route";
import { GET as reviewCron } from "@/app/api/cron/review-invitations/route";
import {
  getReviewInvitationEmail,
  getReviewLink,
  processReviewInvitationQueue,
} from "@/lib/reviews/invitation-email";
import { createReviewToken, hashReviewToken, isReviewTokenFormat } from "@/lib/reviews/tokens";
import { defaultReviewerName, validateReviewInput } from "@/lib/reviews/validation";
import { parsePublicReview, parseReviewSummary } from "@/lib/reviews/public";

const invitationId = "5c1f2f3e-7d2b-4f0e-9a61-0d5f4b9b8a11";
const secondInvitationId = "6d2a3b4c-8e3c-4a1f-8b72-1e6a5c0c9b22";
const job = {
  invitation_id: invitationId,
  delivery_generation: 0,
  customer_email: "buyer@example.com",
  customer_name: "Priya Sharma",
  product_name: "Sketch Daily <Workbook>",
  creator_name: "Aanya & Co",
};

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REVIEW_TOKEN_SECRET", "test-review-token-secret-that-is-long-enough");
  vi.stubEnv("REVIEW_INVITATIONS_ENABLED", "true");
  vi.stubEnv("RESEND_API_KEY", "test-resend-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "CloverLoop <hello@example.com>");
  vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "support@example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("review tokens", () => {
  it("are deterministic per invitation and delivery generation", () => {
    const token = createReviewToken(invitationId, 0);
    expect(isReviewTokenFormat(token)).toBe(true);
    expect(createReviewToken(invitationId, 0)).toBe(token);
    expect(createReviewToken(invitationId, 1)).not.toBe(token);
    expect(createReviewToken(secondInvitationId, 0)).not.toBe(token);
  });

  it("store only a SHA-256 hash and refuse to issue tokens without a strong secret", () => {
    const token = createReviewToken(invitationId, 0)!;
    expect(hashReviewToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashReviewToken(token)).not.toContain(token);
    vi.stubEnv("REVIEW_TOKEN_SECRET", "too-short");
    expect(createReviewToken(invitationId, 0)).toBeNull();
  });
});

describe("review validation", () => {
  it("accepts a trimmed review and enforces rating, length and name rules", () => {
    expect(validateReviewInput({ rating: 5, body: "  Great  ", reviewerName: "  Priya   S. " })).toEqual({
      ok: true,
      review: { rating: 5, body: "Great", reviewerName: "Priya S." },
    });
    expect(validateReviewInput({ rating: 0, body: "", reviewerName: "A" }).ok).toBe(false);
    expect(validateReviewInput({ rating: 4.5, body: "", reviewerName: "A" }).ok).toBe(false);
    expect(validateReviewInput({ rating: 3, body: "x".repeat(2001), reviewerName: "A" }).ok).toBe(false);
    expect(validateReviewInput({ rating: 3, body: "", reviewerName: "   " }).ok).toBe(false);
    expect(validateReviewInput({ rating: 3, body: "", reviewerName: "<b>" }).ok).toBe(false);
  });

  it("suggests a privacy-friendly display name", () => {
    expect(defaultReviewerName("Priya Sharma")).toBe("Priya S.");
    expect(defaultReviewerName("Arjun")).toBe("Arjun");
    expect(defaultReviewerName(null)).toBe("Verified buyer");
  });
});

describe("public review parsing", () => {
  it("rounds averages and ignores empty or malformed summaries", () => {
    expect(parseReviewSummary({
      review_count: 3, average_rating: "4.67", rating_5: 2, rating_4: 1, rating_3: 0, rating_2: 0, rating_1: 0,
    })).toEqual({ reviewCount: 3, averageRating: 4.7, distribution: { 5: 2, 4: 1, 3: 0, 2: 0, 1: 0 } });
    expect(parseReviewSummary({ review_count: 0, average_rating: null })).toBeNull();
    expect(parsePublicReview({
      id: "r1", reviewer_name: "Priya S.", rating: 6, body: "", submitted_at: "2026-11-20T10:00:00Z",
    })).toBeNull();
  });
});

describe("review invitation email", () => {
  it("personalises the subject and body and escapes buyer-facing values", () => {
    const email = getReviewInvitationEmail(job, "https://cloverloop.in/review#token=abc");
    expect(email.subject).toBe("How was your experience with Sketch Daily <Workbook>?");
    expect(email.html).toContain("Hi Priya,");
    expect(email.html).toContain("Sketch Daily &lt;Workbook&gt;");
    expect(email.html).toContain("Aanya &amp; Co");
    expect(email.html).toContain("Write a Review");
    expect(email.html).not.toContain(invitationId);
    expect(email.text).toContain("Team CloverLoop");
    expect(email.text).toContain("support@example.com");
  });

  it("puts the token in the URL fragment so it never reaches server logs", () => {
    const link = new URL(getReviewLink("token_value"));
    expect(link.pathname).toBe("/review");
    expect(link.search).toBe("");
    expect(link.hash).toBe("#token=token_value");
  });
});

describe("review invitation queue", () => {
  it("does nothing until invitations are explicitly enabled", async () => {
    vi.stubEnv("REVIEW_INVITATIONS_ENABLED", "false");
    const rpc = vi.fn();
    const result = await processReviewInvitationQueue({ rpc } as never, "live");
    expect(result).toEqual({ claimed: 0, accepted: 0, failed: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("attaches the token hash before sending, throttles sends and records outcomes idempotently", async () => {
    const secondJob = { ...job, invitation_id: secondInvitationId, delivery_generation: 2, customer_name: null };
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_product_review_invitations") return { data: [job, secondJob], error: null };
      return { data: true, error: null };
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "email_review_1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn(async () => undefined);

    const result = await processReviewInvitationQueue({ rpc } as never, "live", { batchSize: 10, sleep });

    expect(result).toEqual({ claimed: 2, accepted: 1, failed: 1 });
    expect(rpc).toHaveBeenCalledWith("claim_product_review_invitations", { p_environment: "live", p_batch_size: 10 });
    expect(sleep).toHaveBeenCalledTimes(1);

    const firstToken = createReviewToken(invitationId, 0)!;
    expect(rpc).toHaveBeenCalledWith("attach_product_review_invitation_token", expect.objectContaining({
      p_invitation_id: invitationId,
      p_delivery_generation: 0,
      p_token_hash: hashReviewToken(firstToken),
    }));
    const firstRequest = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = firstRequest.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe(`review-invitation-${invitationId}-0`);
    const payload = JSON.parse(String(firstRequest.body));
    expect(payload.to).toEqual(["buyer@example.com"]);
    expect(payload.tags).toEqual([{ name: "cloverloop_review_invitation_id", value: invitationId }]);
    expect(payload.html).toContain(`#token=${firstToken}`);
    expect(payload.html).toContain("Hi Priya,");

    const secondHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(secondHeaders["Idempotency-Key"]).toBe(`review-invitation-${secondInvitationId}-2`);
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body)).html).toContain("Hi there,");

    expect(rpc).toHaveBeenCalledWith("finish_product_review_invitation_delivery", {
      p_invitation_id: invitationId,
      p_delivery_generation: 0,
      p_status: "accepted",
      p_provider_email_id: "email_review_1",
      p_error_code: null,
    });
    expect(rpc).toHaveBeenCalledWith("finish_product_review_invitation_delivery", {
      p_invitation_id: secondInvitationId,
      p_delivery_generation: 2,
      p_status: "failed",
      p_provider_email_id: null,
      p_error_code: "resend_http_429",
    });
  });

  it("does not send when the lease was lost before the token could be attached", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_product_review_invitations") return { data: [job], error: null };
      if (name === "attach_product_review_invitation_token") return { data: false, error: null };
      return { data: true, error: null };
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await processReviewInvitationQueue({ rpc } as never, "test", { sleep: async () => undefined });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });
});

describe("review invitation cron", () => {
  it("requires the cron secret and skips safely while disabled", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    expect((await reviewCron(new Request("https://cloverloop.test/api/cron/review-invitations"))).status).toBe(401);
    vi.stubEnv("REVIEW_INVITATIONS_ENABLED", "");
    const response = await reviewCron(new Request("https://cloverloop.test/api/cron/review-invitations", {
      headers: { authorization: "Bearer cron-secret" },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ skipped: true });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});

describe("review API routes", () => {
  const token = createHmac("sha256", "x").update("token").digest("base64url");

  it("looks up invitations by token hash and never echoes internal identifiers", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        state: "valid",
        product_name: "Sketch Daily",
        product_description: "A workbook",
        product_cover_image_path: "creator/cover.webp",
        product_id: "8b7f2d1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
        storefront_username: "aanya",
        creator_name: "Aanya Mehra",
        customer_name: "Priya Sharma",
        storefront_published: true,
      }],
      error: null,
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      rpc,
      storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }) }) },
    });

    const response = await invitationRoute(jsonRequest("https://cloverloop.test/api/reviews/invitation", { token }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_product_review_invitation", {
      p_token_hash: createHash("sha256").update(token).digest("hex"),
    });
    expect(body).toMatchObject({
      state: "valid",
      creatorName: "Aanya Mehra",
      suggestedName: "Priya S.",
      product: { name: "Sketch Daily", coverImageUrl: "https://cdn.test/creator/cover.webp" },
    });
    expect(JSON.stringify(body)).not.toContain("buyer@example.com");
  });

  it("rejects malformed tokens and unknown invitations", async () => {
    expect((await invitationRoute(jsonRequest("https://cloverloop.test/api/reviews/invitation", { token: "short" }))).status).toBe(400);
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: [], error: null }) });
    expect((await invitationRoute(jsonRequest("https://cloverloop.test/api/reviews/invitation", { token }))).status).toBe(404);
  });

  it("validates submissions before touching the database", async () => {
    const response = await submitRoute(jsonRequest("https://cloverloop.test/api/reviews/submit", {
      token, rating: 9, body: "", reviewerName: "Priya",
    }));
    expect(response.status).toBe(400);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("submits through the server-side eligibility function using only the token hash", async () => {
    const rpc = vi.fn(async (name: string) => name === "submit_product_review"
      ? { data: "review-id", error: null }
      : { data: [{ storefront_published: true, storefront_username: "aanya", product_id: "8b7f2d1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f" }], error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc });

    const response = await submitRoute(jsonRequest("https://cloverloop.test/api/reviews/submit", {
      token, rating: 5, body: " Loved it ", reviewerName: "Priya S.",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, productUrl: "/aanya/product/8b7f2d1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f" });
    expect(rpc).toHaveBeenCalledWith("submit_product_review", {
      p_token_hash: createHash("sha256").update(token).digest("hex"),
      p_rating: 5,
      p_body: "Loved it",
      p_reviewer_name: "Priya S.",
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(token);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/aanya/product/8b7f2d1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f");
  });

  it.each([
    ["RVUSE", 409, "used"],
    ["RVEXP", 410, "expired"],
    ["RVINE", 403, "ineligible"],
    ["RVINV", 404, "invalid"],
  ])("maps the %s eligibility failure to HTTP %i", async (code, status, state) => {
    mocks.createSupabaseAdminClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code } }),
    });
    const response = await submitRoute(jsonRequest("https://cloverloop.test/api/reviews/submit", {
      token, rating: 4, body: "", reviewerName: "Priya",
    }));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ state });
  });
});

describe("Resend webhook routing for review invitations", () => {
  const secret = `whsec_${Buffer.from("resend-signing-secret").toString("base64")}`;

  function signedRequest(rawBody: string) {
    const id = "msg_review_1";
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64"))
      .update(`${id}.${timestamp}.${rawBody}`)
      .digest("base64");
    return new Request("https://cloverloop.test/api/webhooks/resend", {
      method: "POST",
      headers: { "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": `v1,${signature}` },
      body: rawBody,
    });
  }

  it("records review invitation delivery events separately from purchase emails", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc });
    const response = await resendWebhook(signedRequest(JSON.stringify({
      type: "email.bounced",
      data: { email_id: "email_review_1", tags: [{ name: "cloverloop_review_invitation_id", value: invitationId }] },
    })));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_resend_review_invitation_event", {
      p_event_id: "msg_review_1",
      p_event_type: "email.bounced",
      p_invitation_id: invitationId,
      p_provider_email_id: "email_review_1",
    });
    expect(rpc).not.toHaveBeenCalledWith("record_resend_purchase_email_event", expect.anything());
  });
});
