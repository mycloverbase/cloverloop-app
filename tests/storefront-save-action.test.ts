import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  creatorAgreementIsAccepted: vi.fn(),
  revalidatePath: vi.fn(),
  removeCreatorAvatar: vi.fn(),
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
vi.mock("@/lib/account/profile-photo-storage", () => ({
  removeCreatorAvatar: mocks.removeCreatorAvatar,
  removeStorefrontAsset: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { publishStorefrontAction, saveStorefrontAction } from "@/app/dashboard/storefront/actions";
import { DEFAULT_STOREFRONT_CUSTOMIZATION } from "@/lib/storefront/types";

const userId = "320f03e0-472b-4d61-9a52-f330db41f1ba";
const avatarPath = `${userId}/9a72ce31-50ad-4acf-b857-fd3c4f8d8895.webp`;
const storefrontId = "3a624808-18bc-4e16-986f-51ca88181487";

function configureAction({
  inputImagePath,
  currentAvatarPath = avatarPath,
  previousImagePath = inputImagePath,
  rpcError = null,
}: {
  inputImagePath: string | null;
  currentAvatarPath?: string | null;
  previousImagePath?: string | null;
  rpcError?: { code: string; message: string } | null;
}) {
  const authStorageFrom = vi.fn(() => ({
    getPublicUrl: vi.fn((path: string) => ({
      data: { publicUrl: `https://storage.example.test/storefront-assets/${path}` },
    })),
  }));
  const rpc = vi.fn(async () => ({ data: storefrontId, error: rpcError }));
  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
    },
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => ({
          data: table === "creator_storefronts"
            ? {
                id: storefrontId,
                username: "test-store",
                status: "draft",
                profile_image_path: previousImagePath,
              }
            : { avatar_path: currentAvatarPath },
          error: null,
        })),
        single: vi.fn(async () => ({
          data: { username: "test-store" },
          error: null,
        })),
      };
      return builder;
    }),
    storage: { from: authStorageFrom },
    rpc,
  };
  mocks.createSupabaseServerClient.mockResolvedValue(supabase);
  mocks.creatorAgreementIsAccepted.mockResolvedValue(true);
  return { authStorageFrom, rpc };
}

function storefrontInput(profileImagePath: string | null) {
  return {
    storeName: "Test Store",
    username: "test-store",
    description: "",
    profileImagePath,
    bannerImagePath: null,
    theme: "minimal",
    customization: DEFAULT_STOREFRONT_CUSTOMIZATION,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("saveStorefrontAction public profile image URLs", () => {
  it("does not regenerate the URL for an unchanged profile image", async () => {
    const { authStorageFrom, rpc } = configureAction({
      inputImagePath: avatarPath,
    });

    const result = await saveStorefrontAction(storefrontInput(avatarPath));

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledOnce();
    expect(authStorageFrom).not.toHaveBeenCalled();
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("uses the stable public storefront URL when adopting the saved profile image", async () => {
    const { authStorageFrom, rpc } = configureAction({
      inputImagePath: null,
      previousImagePath: null,
    });

    const result = await saveStorefrontAction(storefrontInput(null));

    expect(result).toMatchObject({
      ok: true,
      path: avatarPath,
      imageUrl: `https://storage.example.test/storefront-assets/${avatarPath}`,
    });
    expect(authStorageFrom).toHaveBeenCalledWith("storefront-assets");
    expect(rpc).toHaveBeenCalledOnce();
  });
});

describe("publishStorefrontAction", () => {
  it("explains that an active paid product is required", async () => {
    configureAction({
      inputImagePath: avatarPath,
      rpcError: {
        code: "23514",
        message: "Choose at least one active paid product before publishing.",
      },
    });

    const result = await publishStorefrontAction();

    expect(result).toEqual({
      ok: false,
      message: "Add and activate at least one paid product before publishing your storefront.",
    });
  });
});
