import type { Metadata } from "next";
import { ProfileEditor } from "@/components/dashboard/profile-editor";
import { getAvatarSignedUrl, requireCreatorContext } from "@/lib/account/server";

export const metadata: Metadata = {
  title: "My profile | CloverLoop",
  robots: { index: false, follow: false },
};

export default async function CreatorProfilePage() {
  const { supabase, profile } = await requireCreatorContext();
  const avatarUrl = await getAvatarSignedUrl(supabase, profile.avatar_path);

  return (
    <div className="dashboard-page-content">
      <header className="dashboard-page-heading">
        <div>
          <span className="eyebrow">Creator account</span>
          <h1>My Profile</h1>
          <p>Manage your creator identity, profile picture and social links.</p>
        </div>
      </header>
      <ProfileEditor profile={profile} avatarUrl={avatarUrl} />
    </div>
  );
}
