import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

describe("createSupabaseAdminClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("only requires the Supabase URL and server-only service role key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    mocks.createClient.mockReturnValue("admin-client");

    expect(createSupabaseAdminClient()).toBe("admin-client");
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "service-role-key",
      expect.any(Object),
    );
  });

  it("returns null and reports missing server configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(createSupabaseAdminClient()).toBeNull();
    expect(error).toHaveBeenCalledWith("Supabase admin client is not configured.", {
      missing: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    });
  });
});
