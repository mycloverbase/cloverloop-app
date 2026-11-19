import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((location: string): never => {
    throw new Error(`redirect:${location}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

import {
  changeCreatorPlanAction,
  changeFoundingCreatorEntitlementAction,
} from "@/app/dashboard/admin/actions";

const creatorId = "320f03e0-472b-4d61-9a52-f330db41f1ba";

function formData(plan: string) {
  const form = new FormData();
  form.set("creator_id", creatorId);
  form.set("plan", plan);
  form.set("reason", "Verified support request");
  return form;
}

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

describe("admin creator plan action", () => {
  it("uses the audited entitlement RPC for Founding Creator enrolment", async () => {
    const rpc = setSupabaseResponse("admin", { data: "added", error: null });

    await expect(changeCreatorPlanAction(formData("founding_creator")))
      .rejects.toThrow("redirect:/dashboard/admin/plans?result=founder-enrolled");

    expect(rpc).toHaveBeenCalledWith("admin_set_founding_creator_entitlement", {
      requested_creator_id: creatorId,
      requested_action: "add",
      requested_reason: "Verified support request",
    });
  });

  it("routes standard plan changes through the admin-only plan RPC", async () => {
    const rpc = setSupabaseResponse("admin", { data: "updated", error: null });

    await expect(changeCreatorPlanAction(formData("creator")))
      .rejects.toThrow("redirect:/dashboard/admin/plans?result=updated");

    expect(rpc).toHaveBeenCalledWith("admin_change_creator_plan", {
      requested_creator_id: creatorId,
      requested_plan: "creator",
      requested_reason: "Verified support request",
    });
  });

  it("rejects non-admin users before calling a plan RPC", async () => {
    const rpc = setSupabaseResponse("creator", { data: "updated", error: null });

    await expect(changeCreatorPlanAction(formData("free")))
      .rejects.toThrow("redirect:/dashboard?error=admin");

    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects plans that must be managed by the payment provider", async () => {
    const rpc = vi.fn();

    await expect(changeCreatorPlanAction(formData("pro_creator")))
      .rejects.toThrow("redirect:/dashboard/admin/plans?result=invalid");

    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("routes Founding Creator removal through the entitlement RPC", async () => {
    const rpc = setSupabaseResponse("admin", { data: "removed", error: null });
    const form = formData("free");
    form.set("action", "remove");

    await expect(changeFoundingCreatorEntitlementAction(form))
      .rejects.toThrow("redirect:/dashboard/admin/founding-creators?result=removed");

    expect(rpc).toHaveBeenCalledWith("admin_set_founding_creator_entitlement", {
      requested_creator_id: creatorId,
      requested_action: "remove",
      requested_reason: "Verified support request",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/admin/founding-creators");
  });
});
