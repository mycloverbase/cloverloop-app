import { describe, expect, it } from "vitest";
import { validateProductFileMetadata } from "@/lib/storefront/product-files";

describe("validateProductFileMetadata", () => {
  it("accepts the PRST extension with its generic MIME type", () => {
    expect(validateProductFileMetadata("preset.prst", 1200, "application/octet-stream")).toMatchObject({
      ok: true,
      value: {
        extension: "prst",
        mimeType: "application/octet-stream",
      },
    });
  });

  it("preserves the declared MIME type for other file extensions", () => {
    expect(validateProductFileMetadata("project.custom", 1200, "application/x-custom-project")).toMatchObject({
      ok: true,
      value: {
        extension: "custom",
        mimeType: "application/x-custom-project",
      },
    });
  });

  it("uses the generic MIME type when the browser provides none", () => {
    expect(validateProductFileMetadata("project.custom", 1200, "")).toMatchObject({
      ok: true,
      value: {
        extension: "custom",
        mimeType: "application/octet-stream",
      },
    });
  });
});
