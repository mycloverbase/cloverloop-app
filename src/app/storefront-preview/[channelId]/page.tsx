import type { Metadata } from "next";
import { StorefrontDesktopPreview } from "@/components/storefront/storefront-desktop-preview";
import { requireCreatorContext } from "@/lib/account/server";

export const metadata: Metadata = {
  title: "Storefront preview | CloverLoop",
  robots: { index: false, follow: false },
};

export default async function StorefrontPreviewPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId } = await params;
  await requireCreatorContext();
  return <StorefrontDesktopPreview channelId={channelId} />;
}
