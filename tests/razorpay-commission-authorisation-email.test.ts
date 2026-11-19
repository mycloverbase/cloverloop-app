import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { processRazorpayCommissionAuthorisationEmailQueue } from "@/lib/razorpay/commission-authorisation-email";

const claim = {
  email_id: "email-row-1",
  consent_id: "consent-1",
  creator_id: "creator-1",
  recipient_email: "partnerships@razorpay.example",
  creator_email: "creator@example.test",
  business_name: "Creator & Co",
  razorpay_account_id: "acc_ABC123",
  application_id: "client-four",
  plan_status: "creator",
  consent_timestamp: "2026-11-18T12:00:00.000Z",
  terms_version: "creator-4-percent-v1",
  attempt_count: 1,
};

function createAdmin() {
  const rpc = vi.fn(async (name: string) => {
    if (name === "claim_razorpay_commission_authorisation_emails") {
      return { data: [claim], error: null };
    }
    return { data: true, error: null };
  });
  return { rpc };
}

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "test-resend-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "CloverLoop <hello@example.test>");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Razorpay commission authorization email queue", () => {
  it("sends the compliance email to Razorpay, copies the creator, and stores the provider message ID", async () => {
    const admin = createAdmin();
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        to: string[];
        cc: string[];
        subject: string;
        html: string;
        text: string;
      };
      expect(init?.headers).toMatchObject({
        "Idempotency-Key": "razorpay-commission-consent-1",
      });
      expect(body.to).toEqual(["partnerships@razorpay.example"]);
      expect(body.cc).toEqual(["creator@example.test"]);
      expect(body.subject).toContain("acc_ABC123");
      expect(body.html).toContain("Creator &amp; Co");
      expect(body.html).toContain("https://cloverloop.in/images/brand/logo.png");
      expect(body.html).toContain("@media only screen and (max-width:620px)");
      expect(body.html).toContain("Subscription plan");
      expect(body.html).toContain("Creator Plan");
      expect(body.text).toContain("Creator legal/business name: Creator & Co");
      expect(body.text).toContain("Subscription plan: Creator Plan");
      expect(body.text).toContain("4% + applicable GST");
      expect(body.text).toContain("additional platform commission of 4%");
      expect(body.text).not.toContain("access_token");
      for (const hiddenValue of [
        "creator-1",
        "client-four",
        "creator-4-percent-v1",
        "CloverLoop creator ID",
        "Razorpay Application ID",
        "Accepted terms version",
      ]) {
        expect(body.html).not.toContain(hiddenValue);
        expect(body.text).not.toContain(hiddenValue);
      }
      return Response.json({ id: "resend-message-1" });
    });
    vi.stubGlobal("fetch", fetch);

    const result = await processRazorpayCommissionAuthorisationEmailQueue(admin as never);

    expect(result).toEqual({ claimed: 1, sent: 1, retried: 0, failed: 0 });
    expect(admin.rpc).toHaveBeenNthCalledWith(
      2,
      "finish_razorpay_commission_authorisation_email",
      expect.objectContaining({
        p_email_id: claim.email_id,
        p_sent: true,
        p_message_id: "resend-message-1",
        p_error_code: null,
      }),
    );
  });

  it("records temporary provider failures for retry without discarding consent", async () => {
    const admin = createAdmin();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("temporary failure", { status: 503 })),
    );

    const result = await processRazorpayCommissionAuthorisationEmailQueue(admin as never);

    expect(result).toEqual({ claimed: 1, sent: 0, retried: 1, failed: 0 });
    expect(admin.rpc).toHaveBeenNthCalledWith(
      2,
      "finish_razorpay_commission_authorisation_email",
      expect.objectContaining({
        p_email_id: claim.email_id,
        p_sent: false,
        p_error_code: "resend_http_503",
      }),
    );
  });
});
