import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreatorAgreementAcceptance } from "@/components/creator-agreement-acceptance";
import { Breadcrumbs } from "@/components/site-header";
import { safeInternalPath } from "@/lib/auth-redirect";
import { creatorAgreementIsAccepted } from "@/lib/account/creator-agreement-consent";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Accept Creator Agreement | CloverLoop",
  robots: { index: false, follow: false },
};

export default async function CreatorAgreementAcceptancePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const nextValue = Array.isArray(params.next) ? params.next[0] : params.next;
  const nextPath = safeInternalPath(nextValue);
  const destination = nextPath === "/creator-agreement/accept" ? "/dashboard" : nextPath;
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?error=configuration");

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    if (error) console.error("Could not verify the session for Creator Agreement acceptance.", error);
    redirect("/login?next=%2Fdashboard");
  }
  if (await creatorAgreementIsAccepted(supabase)) redirect(destination);

  const errorValue = Array.isArray(params.error) ? params.error[0] : params.error;
  const initialError = errorValue === "save"
    ? "We couldn't record your acceptance. Review the agreement and submit again."
    : "";

  return (
    <main className="creator-agreement-acceptance-page">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Creator Agreement" }]} />
      <div className="reading-width">
        <CreatorAgreementAcceptance nextPath={destination} initialError={initialError} />
      </div>
    </main>
  );
}
