import type { Metadata } from "next";
import { StorefrontEditor } from "@/components/storefront/storefront-editor";
import { requireCreatorContext } from "@/lib/account/server";
import { getCreatorStorefront } from "@/lib/storefront/server";

export const metadata: Metadata = {
  title: "Storefront | CloverLoop creator dashboard",
  robots: { index: false, follow: false },
};

export default async function CreatorStorefrontPage() {
  const { supabase, user } = await requireCreatorContext();
  const storefront = await getCreatorStorefront(supabase, user.id);

  return (
    <div className="dashboard-page-content">
      <StorefrontEditor initialStorefront={storefront} />
    </div>
  );
}
