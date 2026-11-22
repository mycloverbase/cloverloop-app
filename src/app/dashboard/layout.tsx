import { Suspense } from "react";
import type { Metadata } from "next";
import { LoaderCircle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  getAvatarSignedUrl,
  getCreatorName,
  getExistingCreatorProfile,
  requireCreatorContext,
  requireCreatorSession,
} from "@/lib/account/server";

export const metadata: Metadata = {
  title: "Creator dashboard | CloverLoop",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type DashboardContext = Awaited<ReturnType<typeof requireCreatorContext>>;

async function DashboardContent({
  children,
  context,
}: {
  children: React.ReactNode;
  context: DashboardContext;
}) {
  const { supabase, user, profile } = context;
  const email = user.email ?? "";
  const creatorName = getCreatorName(profile.display_name, email);
  const avatarUrl = await getAvatarSignedUrl(supabase, profile.avatar_path);

  return (
    <DashboardShell
      creatorName={creatorName}
      email={email}
      avatarUrl={avatarUrl}
      isAdmin={user.app_metadata?.role === "admin"}
    >
      {children}
    </DashboardShell>
  );
}

async function PendingDashboardContent({ children }: { children: React.ReactNode }) {
  return <DashboardContent context={await requireCreatorContext()}>{children}</DashboardContent>;
}

function ProfileCreationLoading() {
  return (
    <div className="creator-profile-loading" role="status">
      <LoaderCircle className="spin" size={28} aria-hidden="true" />
      <span>Creating your profile...</span>
    </div>
  );
}

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireCreatorSession();
  const profile = await getExistingCreatorProfile(session.supabase, session.user.id);

  if (profile) {
    return <DashboardContent context={{ ...session, profile }}>{children}</DashboardContent>;
  }

  return (
    <Suspense fallback={<ProfileCreationLoading />}>
      <PendingDashboardContent>{children}</PendingDashboardContent>
    </Suspense>
  );
}
