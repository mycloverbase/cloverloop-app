import { describe, expect, it, vi } from "vitest";
import { DEFAULT_STOREFRONT_CUSTOMIZATION } from "@/lib/storefront/types";
import { getPublishedStorefrontProduct } from "@/lib/storefront/server";

const productId = "95ab1e94-38c3-4f4f-a20d-fc2f9192b33e";
const productRow = {
  id: productId,
  name: "Digital Marketing Guide",
  description: "A practical creator guide.",
  category: "Education",
  product_type: "digital",
  is_free: false,
  price_paise: 29900,
  cover_image_path: "creator/cover.webp",
  file_name: "guide.pdf",
  file_size: "2048",
  file_mime_type: "application/pdf",
};

function makeSupabase(options: { product?: Record<string, unknown> | null; storefront?: boolean } = {}) {
  const productSelections: string[] = [];
  const rows = new Map<string, Record<string, unknown> | null>([
    ["published_storefronts", options.storefront === false ? null : {
      store_name: "Test Creator",
      username: "test-creator",
      description: "Creator storefront.",
      profile_image_path: null,
      banner_image_path: null,
      theme: "minimal",
      customization: DEFAULT_STOREFRONT_CUSTOMIZATION,
      published_at: "2026-01-01T00:00:00Z",
    }],
    ["published_storefront_products", options.product === undefined ? productRow : options.product],
  ]);
  const client = {
    from: vi.fn((table: string) => {
      const filters = new Map<string, unknown>();
      const builder = {
        select: vi.fn((selection: string) => {
          if (table === "published_storefront_products") productSelections.push(selection);
          return builder;
        }),
        eq: vi.fn((key: string, value: unknown) => {
          filters.set(key, value);
          return builder;
        }),
        maybeSingle: vi.fn(async () => {
          const row = rows.get(table) ?? null;
          if (
            table === "published_storefront_products" &&
            row &&
            filters.has("id") &&
            filters.get("id") !== row.id
          ) return { data: null, error: null };
          return { data: row, error: null };
        }),
        order: vi.fn(async () => ({ data: [], error: null })),
      };
      return builder;
    }),
    storage: {
      from: vi.fn(() => ({
        getPublicUrl: vi.fn((path: string) => ({
          data: { publicUrl: `https://storage.example.test/${path}` },
        })),
      })),
    },
  };
  return { client, productSelections };
}

describe("published storefront product lookup", () => {
  it("returns public details and safe file metadata for an active published product", async () => {
    const { client, productSelections } = makeSupabase();
    const result = await getPublishedStorefrontProduct(client as never, "test-creator", productId);

    expect(result?.storefront.store_name).toBe("Test Creator");
    expect(result?.product).toMatchObject({
      id: productId,
      pricePaise: 29900,
      fileName: "guide.pdf",
      fileSize: 2048,
      fileMimeType: "application/pdf",
    });
    expect(productSelections[productSelections.length - 1]).not.toContain("file_path");
  });

  it("does not return unpublished products or products from unpublished stores", async () => {
    const hiddenProduct = makeSupabase({ product: null });
    expect(
      await getPublishedStorefrontProduct(hiddenProduct.client as never, "test-creator", productId),
    ).toBeNull();
    const hiddenStore = makeSupabase({ storefront: false });
    expect(
      await getPublishedStorefrontProduct(hiddenStore.client as never, "test-creator", productId),
    ).toBeNull();
  });

  it("rejects malformed product identifiers before querying Supabase", async () => {
    const { client } = makeSupabase();
    expect(await getPublishedStorefrontProduct(client as never, "test-creator", "not-a-uuid")).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });
});
