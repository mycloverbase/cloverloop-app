import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  creatorAgreementIsAccepted: vi.fn(),
  createRazorpayOAuthState: vi.fn(),
  getRazorpayApplicationConfig: vi.fn(),
  getRazorpayApplicationReadiness: vi.fn(),
  getRazorpayOAuthMode: vi.fn(),
  selectRazorpayApplication: vi.fn(),
  redirectedTo: vi.fn(),
  stateInsertError: false,
  oauthState: null as Record<string, unknown> | null,
}));

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    mocks.redirectedTo(destination);
    throw new Error(`REDIRECT:${destination}`);
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/account/creator-agreement-consent", () => ({
  creatorAgreementIsAccepted: mocks.creatorAgreementIsAccepted,
}));
vi.mock("@/lib/razorpay/oauth", () => ({
  createRazorpayOAuthState: mocks.createRazorpayOAuthState,
  getRazorpayApplicationConfig: mocks.getRazorpayApplicationConfig,
  getRazorpayApplicationReadiness: mocks.getRazorpayApplicationReadiness,
  getRazorpayOAuthMode: mocks.getRazorpayOAuthMode,
  selectRazorpayApplication: mocks.selectRazorpayApplication,
}));

import { startRazorpayConnectionAction } from "@/app/dashboard/razorpay/actions";

function configureAction(stateInsertError: boolean) {
  mocks.stateInsertError = stateInsertError;
  mocks.oauthState = null;
  mocks.redirectedTo.mockClear();
  mocks.createSupabaseServerClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "creator-1", email: "creator@example.com" } },
        error: null,
      })),
    },
  });
  mocks.creatorAgreementIsAccepted.mockResolvedValue(true);
  mocks.selectRazorpayApplication.mockReturnValue("FOUR_PERCENT");
  mocks.getRazorpayOAuthMode.mockReturnValue("test");
  mocks.getRazorpayApplicationConfig.mockReturnValue({
    clientId: "four-percent-client",
    environment: "test",
    redirectUri: "https://cloverloop.test/api/razorpay/callback",
  });
  mocks.getRazorpayApplicationReadiness.mockReturnValue({ available: true });
  mocks.createRazorpayOAuthState.mockReturnValue({
    state: "one-time-state",
    stateHash: "a".repeat(64),
  });

  const admin = {
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => ({
          data: table === "plan_entitlements"
            ? {
                plan_key: "creator",
                platform_fee_percentage: 4,
                founder_status: null,
              }
            : null,
          error: null,
        })),
        insert: vi.fn(async (values: Record<string, unknown>) => {
          if (table === "razorpay_oauth_states") {
            mocks.oauthState = values;
            return {
              error: stateInsertError ? { code: "consent_write_failed" } : null,
            };
          }
          return { error: null };
        }),
      };
      return builder;
    }),
  };
  mocks.createSupabaseAdminClient.mockReturnValue(admin);
}

function consentForm() {
  const formData = new FormData();
  formData.set("businessName", "Clover Creator");
  formData.set("razorpayEmail", "CREATOR@EXAMPLE.COM");
  formData.set("commissionConsent", "yes");
  return formData;
}

describe("startRazorpayConnectionAction consent flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not start OAuth when consent details cannot be saved", async () => {
    configureAction(true);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(startRazorpayConnectionAction(consentForm()))
      .rejects.toThrow("REDIRECT:/dashboard/settings?razorpay=consent-record-error");

    expect(mocks.oauthState).toMatchObject({
      business_name: "Clover Creator",
      registered_email: "creator@example.com",
      consent_terms_version: "creator-platform-commission-2026-11-v1",
    });
    expect(mocks.oauthState?.consent_accepted_at).toEqual(expect.any(String));
    expect(mocks.redirectedTo).toHaveBeenCalledTimes(1);
    expect(mocks.redirectedTo.mock.calls[0][0]).not.toContain("auth.razorpay.com");
  });

  it("starts OAuth only after the confirmed consent state is saved", async () => {
    configureAction(false);

    await expect(startRazorpayConnectionAction(consentForm()))
      .rejects.toThrow("REDIRECT:https://auth.razorpay.com/authorize");

    expect(mocks.oauthState?.consent_accepted_at).toEqual(expect.any(String));
    expect(mocks.redirectedTo).toHaveBeenCalledTimes(1);
    expect(mocks.redirectedTo.mock.calls[0][0]).toContain("state=one-time-state");
  });
});
