import { describe, expect, it } from "vitest";
import { isReservedStorefrontUsername } from "@/lib/storefront/reserved-usernames";

describe("isReservedStorefrontUsername", () => {
  it("recognizes reserved names regardless of case", () => {
    expect(isReservedStorefrontUsername("pricing")).toBe(true);
    expect(isReservedStorefrontUsername("LOGIN")).toBe(true);
    expect(isReservedStorefrontUsername("review")).toBe(true);
  });

  it("allows non-reserved storefront names to be checked for redirects", () => {
    expect(isReservedStorefrontUsername("independent-maker")).toBe(false);
  });
});
