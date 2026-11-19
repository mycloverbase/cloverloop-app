import { describe, expect, it } from "vitest";
import { createAuthCallbackUrl } from "@/lib/auth-callback-url";

describe("createAuthCallbackUrl", () => {
  it("uses the current app origin and preserves the callback flow parameters", () => {
    const url = new URL(createAuthCallbackUrl(
      "http://localhost:3000",
      "/dashboard?from=signup",
      true,
    ));

    expect(url.origin).toBe("http://localhost:3000");
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("next")).toBe("/dashboard?from=signup");
    expect(url.searchParams.get("marketing_consent")).toBe("1");
  });

  it("does not add consent parameters when consent was not part of the flow", () => {
    const url = new URL(createAuthCallbackUrl(
      "https://preview.example.test",
      "/forgot-password",
    ));

    expect(url.origin).toBe("https://preview.example.test");
    expect(url.searchParams.get("next")).toBe("/forgot-password");
    expect(url.searchParams.has("marketing_consent")).toBe(false);
  });
});
