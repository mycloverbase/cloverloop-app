import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

import { lookupCreatorByEmailAction } from "@/app/dashboard/admin/actions";

function setSupabaseResponse(
  role: string,
  response: { data: unknown; error: { code: string } | null },
) {
  const rpc = vi.fn().mockResolvedValue(response);
  mocks.createSupabaseServerClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { app_metadata: { role } } },
        error: null,
      }),
    },
    rpc,
  });
  return rpc;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("admin storefront recovery lookup", () => {
  it("looks up the registered email and returns creator and storefront details", async () => {
    const rpc = setSupabaseResponse("admin", {
      data: [{
        creator_id: "320f03e0-472b-4d61-9a52-f330db41f1ba",
        creator_email: "creator@example.test",
        profile_name: "Creator Name",
        storefront_id: "f6d77881-14e5-4f4a-a650-0035b4482363",
        storefront_name: "Creator Store",
        username: "creator-store",
        storefront_status: "deletion_pending",
        deleted_at: "2026-11-01T00:00:00Z",
        delete_after: "2026-12-01T00:00:00Z",
        can_restore: true,
        plan_key: "creator",
        founder_status: "active",
        subscription_status: null,
      }],
      error: null,
    });
    const formData = new FormData();
    formData.set("creator_email", " Creator@Example.Test ");

    await expect(lookupCreatorByEmailAction(formData)).resolves.toMatchObject({
      ok: true,
      creator: {
        email: "creator@example.test",
        profileName: "Creator Name",
        storefrontName: "Creator Store",
        username: "creator-store",
        canRestore: true,
        currentPlan: "creator",
        founderStatus: "active",
      },
    });
    expect(rpc).toHaveBeenCalledWith("admin_lookup_creator_context_by_email", {
      requested_creator_email: "creator@example.test",
    });
  });

  it("returns an explicit result when no account matches the email", async () => {
    setSupabaseResponse("admin", { data: [], error: null });
    const formData = new FormData();
    formData.set("creator_email", "unknown@example.test");

    await expect(lookupCreatorByEmailAction(formData))
      .resolves.toEqual({ ok: true, creator: null });
  });

  it("does not call Supabase for invalid email input", async () => {
    const formData = new FormData();
    formData.set("creator_email", "not-an-email");

    await expect(lookupCreatorByEmailAction(formData)).resolves.toMatchObject({
      ok: false,
    });
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
