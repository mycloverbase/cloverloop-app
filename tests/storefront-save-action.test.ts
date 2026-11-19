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

import { saveStorefrontAction } from "@/app/dashboard/storefront/actions";
import { DEFAULT_STOREFRONT_CUSTOMIZATION } from "@/lib/storefront/types";

const userId = "320f03e0-472b-4d61-9a52-f330db41f1ba";
const avatarPath = `${userId}/9a72ce31-50ad-4acf-b857-fd3c4f8d8895.webp`;
const storefrontId = "3a624808-18bc-4e16-986f-51ca88181487";

function configureAction({
  inputImagePath,
  currentAvatarPath = avatarPath,
  previousImagePath = inputImagePath,
}: {
  inputImagePath: string | null;
  currentAvatarPath?: string | null;
  previousImagePath?: string | null;
}) {
  const signedUrl = vi.fn(async () => ({
    data: { signedUrl: "https://storage.example.test/signed-avatar" },
    error: null,
  }));
  const adminClient = {
    storage: { from: vi.fn(() => ({ createSignedUrl: signedUrl })) },
  };
  mocks.createSupabaseAdminClient.mockReturnValue(adminClient);
  const authStorageFrom = vi.fn(() => ({ createSignedUrl: signedUrl }));
  const rpc = vi.fn(async () => ({ data: storefrontId, error: null }));
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
      };
      return builder;
    }),
    storage: { from: authStorageFrom },
    rpc,
  };
  mocks.createSupabaseServerClient.mockResolvedValue(supabase);
  mocks.creatorAgreementIsAccepted.mockResolvedValue(true);
  return { adminClient, authStorageFrom, rpc, signedUrl };
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

describe("saveStorefrontAction profile image signing", () => {
  it("does not re-sign an unchanged private profile image", async () => {
    const { authStorageFrom, rpc, signedUrl } = configureAction({
      inputImagePath: avatarPath,
    });

    const result = await saveStorefrontAction(storefrontInput(avatarPath));

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledOnce();
    expect(authStorageFrom).not.toHaveBeenCalled();
    expect(signedUrl).not.toHaveBeenCalled();
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("uses the admin signer when adopting the saved profile image into the storefront", async () => {
    const { adminClient, authStorageFrom, rpc, signedUrl } = configureAction({
      inputImagePath: null,
      previousImagePath: null,
    });

    const result = await saveStorefrontAction(storefrontInput(null));

    expect(result).toMatchObject({
      ok: true,
      path: avatarPath,
      imageUrl: "https://storage.example.test/signed-avatar",
    });
    expect(adminClient.storage.from).toHaveBeenCalledWith("creator-avatars");
    expect(signedUrl).toHaveBeenCalledWith(avatarPath, 60 * 60 * 12);
    expect(authStorageFrom).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledOnce();
  });
});
