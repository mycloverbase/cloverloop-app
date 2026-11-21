import { describe, expect, it } from "vitest";
import { normalizeProfileBio, PROFILE_BIO_MAX_LENGTH } from "@/lib/account/profile-bio";

describe("normalizeProfileBio", () => {
  it("counts line breaks the same way as the textarea after form submission", () => {
    const textareaBio = `${"a".repeat(1195)}\n\n\n\n`;
    const submittedBio = textareaBio.replace(/\n/g, "\r\n");

    const normalizedBio = normalizeProfileBio(submittedBio);

    expect(normalizedBio).toBe(textareaBio);
    expect(normalizedBio.length).toBe(1199);
    expect(normalizedBio.length).toBeLessThanOrEqual(PROFILE_BIO_MAX_LENGTH);
  });

  it("normalizes standalone carriage returns too", () => {
    expect(normalizeProfileBio("first\rsecond")).toBe("first\nsecond");
  });
});
