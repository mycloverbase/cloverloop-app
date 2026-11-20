import { describe, expect, it, vi } from "vitest";
import {
  removeCreatorAvatarStorefrontAsset,
  uploadCreatorAvatarStorefrontAsset,
} from "@/lib/account/profile-photo-storage";

const avatarPath = "320f03e0-472b-4d61-9a52-f330db41f1ba/9a72ce31-50ad-4acf-b857-fd3c4f8d8895.webp";

describe("creator avatar storefront copies", () => {
  it("uploads the image under the same path in public storefront storage", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const admin = {
      storage: {
        from: vi.fn(() => ({ upload })),
      },
    };
    const image = new Blob(["webp"], { type: "image/webp" });

    await expect(uploadCreatorAvatarStorefrontAsset(admin as never, avatarPath, image)).resolves.toBe(true);

    expect(admin.storage.from).toHaveBeenCalledWith("storefront-assets");
    expect(upload).toHaveBeenCalledWith(avatarPath, image, {
      contentType: "image/webp",
      cacheControl: "3600",
      upsert: true,
    });
  });

  it("removes the public object and its storefront registry row together", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const eq = vi.fn(async () => ({ error: null }));
    const deleteRow = vi.fn(() => ({ eq }));
    const admin = {
      storage: {
        from: vi.fn(() => ({ remove })),
      },
      from: vi.fn(() => ({ delete: deleteRow })),
    };

    await expect(removeCreatorAvatarStorefrontAsset(admin as never, avatarPath)).resolves.toBe(true);

    expect(admin.storage.from).toHaveBeenCalledWith("storefront-assets");
    expect(remove).toHaveBeenCalledWith([avatarPath]);
    expect(admin.from).toHaveBeenCalledWith("storefront_assets");
    expect(deleteRow).toHaveBeenCalledOnce();
    expect(eq).toHaveBeenCalledWith("path", avatarPath);
  });
});
