import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  creatorAgreementIsAccepted: vi.fn(),
  recordCreatorAgreementAcceptance: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      getUser: mocks.getUser,
    },
    rpc: mocks.rpc,
  }),
}));

vi.mock("@/lib/supabase/config", () => ({
  getSupabaseConfig: () => ({ url: "https://supabase.test", key: "anon-key" }),
}));

vi.mock("@/lib/account/creator-agreement-consent", () => ({
  clientIpAddress: () => null,
  CREATOR_AGREEMENT_PROOF_COOKIE: "cloverloop-creator-agreement-proof",
  creatorAgreementIsAccepted: mocks.creatorAgreementIsAccepted,
  recordCreatorAgreementAcceptance: mocks.recordCreatorAgreementAcceptance,
}));

vi.mock("@/lib/referrals/server", () => ({
  FOUNDER_REFERRAL_COOKIE: "founder-referral",
  getFounderReferralIssuedAt: () => null,
}));

import { GET } from "@/app/auth/callback/route";

beforeEach(() => {
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "creator-id", created_at: new Date().toISOString() } },
    error: null,
  });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.creatorAgreementIsAccepted.mockResolvedValue(true);
  mocks.recordCreatorAgreementAcceptance.mockResolvedValue({ ok: true });
});

describe("email authentication callback", () => {
  it("records agreement acceptance before saving marketing consent", async () => {
    const request = new NextRequest(
      "https://cloverloop.test/auth/callback?code=auth-code&next=%2Fdashboard&marketing_consent=1",
      { headers: { cookie: "cloverloop-creator-agreement-proof=valid-proof" } },
    );

    await GET(request);

    expect(mocks.recordCreatorAgreementAcceptance.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.rpc.mock.invocationCallOrder[0]);
    expect(mocks.rpc).toHaveBeenCalledWith("save_my_marketing_consent", {
      requested_consent: true,
    });
  });

  it("does not save marketing consent when agreement acceptance is missing", async () => {
    mocks.creatorAgreementIsAccepted.mockResolvedValue(false);
    const request = new NextRequest(
      "https://cloverloop.test/auth/callback?code=auth-code&next=%2Fdashboard&marketing_consent=1",
    );

    await GET(request);

    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
