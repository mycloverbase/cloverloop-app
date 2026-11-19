import { describe, expect, it, vi } from "vitest";
import { ensureCreatorProfile } from "@/lib/account/server";

const userId = "b1917dfd-b485-487c-b441-e4cfa3679217";

function createClient(
  profileRows: Array<{ user_id: string } | null>,
  upsertErrors: Array<{ code: string } | null>,
) {
  const maybeSingle = vi.fn();
  for (const data of profileRows) {
    maybeSingle.mockResolvedValueOnce({ data, error: null });
  }
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle,
  };
  const upsert = vi.fn();
  for (const error of upsertErrors) {
    upsert.mockResolvedValueOnce({ error });
  }
  const client = {
    from: vi.fn(() => ({ ...query, upsert })),
  } as unknown as Parameters<typeof ensureCreatorProfile>[0];

  return { client, upsert };
}

const user = {
  id: userId,
  email: "creator@example.test",
  app_metadata: {},
  user_metadata: { username: "new-creator" },
  aud: "authenticated",
  created_at: "2026-11-19T12:09:00.000Z",
} as Parameters<typeof ensureCreatorProfile>[1];

describe("ensureCreatorProfile", () => {
  it("uses an idempotent upsert when another dashboard request creates the profile first", async () => {
    const { client, upsert } = createClient([null, { user_id: userId }], [null]);

    const profile = await ensureCreatorProfile(client, user);

    expect(profile.user_id).toBe(userId);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: userId, username: "new-creator" }),
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  });

  it("retries without the requested username when another creator owns it", async () => {
    const { client, upsert } = createClient(
      [null, { user_id: userId }],
      [{ code: "23505" }, null],
    );

    const profile = await ensureCreatorProfile(client, user);

    expect(profile.user_id).toBe(userId);
    expect(upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ user_id: userId, username: null }),
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  });
});
