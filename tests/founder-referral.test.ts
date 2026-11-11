import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFounderReferralCookieValue,
  getFounderReferralIssuedAt,
} from "@/lib/referrals/server";

vi.mock("server-only", () => ({}));

const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function signedCookie(now: number): string {
  const cookie = createFounderReferralCookieValue(now);
  if (!cookie) throw new Error("The test referral cookie could not be signed.");
  return cookie;
}

afterEach(() => {
  if (originalServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
});

describe("founder referral cookie", () => {
  it("verifies signed referral timestamps", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-secret";
    const now = 1_800_000_000_000;
    const cookie = signedCookie(now);
    expect(getFounderReferralIssuedAt(cookie, now)).toBe(now);
  });

  it("rejects tampered, expired, malformed, and unconfigured values", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-secret";
    const now = 1_800_000_000_000;
    const cookie = signedCookie(now);
    expect(getFounderReferralIssuedAt(`${cookie}tampered`, now)).toBeNull();
    expect(getFounderReferralIssuedAt(cookie, now + 366 * 24 * 60 * 60 * 1000)).toBeNull();
    expect(getFounderReferralIssuedAt("founder.invalid", now)).toBeNull();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(createFounderReferralCookieValue(now)).toBeNull();
    expect(getFounderReferralIssuedAt(cookie, now)).toBeNull();
  });
});
