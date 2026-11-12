import type { Metadata } from "next";
import { InstagramAutomations } from "@/components/dashboard/instagram-automations";

export const metadata: Metadata = {
  title: "Instagram Automations | CloverLoop",
  robots: { index: false, follow: false },
};

export default async function InstagramAutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ instagram?: string | string[] }>;
}) {
  const search = await searchParams;
  const result = Array.isArray(search.instagram) ? search.instagram[0] : search.instagram;
  return <InstagramAutomations oauthResult={result ?? null} />;
}
