import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAvatarSignedUrl, getCreatorFirstName, requireCreatorContext } from "@/lib/account/server";

export const metadata: Metadata = {
  title: "Creator dashboard | CloverLoop",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { supabase, user, profile } = await requireCreatorContext();
  const email = user.email ?? "";
  const creatorName = getCreatorFirstName(profile.display_name, email);
  const avatarUrl = await getAvatarSignedUrl(supabase, profile.avatar_path);

  return (
    <DashboardShell creatorName={creatorName} email={email} avatarUrl={avatarUrl}>
      {children}
    </DashboardShell>
  );
}
