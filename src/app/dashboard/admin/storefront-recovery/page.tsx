import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminCreatorLookup } from "@/app/dashboard/admin/creator-lookup";
import { requireCreatorContext } from "@/lib/account/server";

export const metadata: Metadata = {
  title: "Storefront recovery | CloverLoop administration",
  robots: { index: false, follow: false },
};

export default async function StorefrontRecoveryAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const { user } = await requireCreatorContext();
  if (user.app_metadata?.role !== "admin") redirect("/dashboard");

  const { result } = await searchParams;
  const resultMessage = result === "restored"
    ? "Storefront restored as unpublished. The creator can review and publish it again."
    : result === "expired"
      ? "The recovery window has expired. This storefront can no longer be restored through this tool."
      : result === "not-pending"
        ? "This storefront is no longer pending deletion."
        : result === "invalid"
          ? "Enter a valid storefront and a recovery reason of 5–500 characters."
          : result === "failed"
            ? "The storefront could not be restored. Check the server logs and current storefront status."
            : "";

  return (
    <div className="dashboard-page-content">
      <header className="dashboard-page-heading">
        <div>
          <span className="eyebrow">Admin-only</span>
          <h1>Storefront recovery</h1>
          <p>Find a creator by registered email and restore eligible storefronts as unpublished.</p>
        </div>
      </header>
      {resultMessage ? <p className="dashboard-message" role="status">{resultMessage}</p> : null}
      <AdminCreatorLookup mode="storefront-recovery" />
    </div>
  );
}
