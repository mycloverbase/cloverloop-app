import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminCreatorLookup } from "@/app/dashboard/admin/creator-lookup";
import { requireCreatorContext } from "@/lib/account/server";

export const metadata: Metadata = {
  title: "Creator plan administration | CloverLoop",
  robots: { index: false, follow: false },
};

export default async function AdminCreatorPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const { user } = await requireCreatorContext();
  if (user.app_metadata?.role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const resultMessage = params.result === "updated"
    ? "Creator plan updated. Any required Razorpay application migration is tracked; the creator must complete the appropriate reconnect and consent flow."
    : params.result === "unchanged"
      ? "The creator already has the selected plan."
      : params.result === "founder-enrolled"
        ? "Founding Creator entitlement added for three months."
        : params.result === "founder-already_active"
          ? "This creator already has an active Founding Creator entitlement."
          : params.result === "founder-capacity_reached"
            ? "All 50 Founding Creator programme slots have been allocated."
            : params.result === "founder-subscription_managed"
              ? "This creator has a paid subscription. Change it through the payment provider before granting Founding Creator."
              : params.result === "founder-not_found"
                ? "The creator account could not be found. Fetch the details again and retry."
                : params.result === "subscription-managed"
                  ? "This creator has a pending or active paid subscription. Change it through the payment provider instead."
                  : params.result === "invalid"
                    ? "Enter a registered email, choose an available plan, and provide a reason of 5–500 characters."
                    : params.result === "founder-failed" || params.result === "failed"
                      ? "The plan change could not be completed. Check the creator account and server logs."
                      : "";

  return (
    <div className="dashboard-page-content">
      <header className="dashboard-page-heading">
        <div>
          <span className="eyebrow">Admin-only</span>
          <h1>Change creator plan</h1>
          <p>Plan changes are recorded with the administrator and reason. Paid subscriptions cannot be bypassed here.</p>
        </div>
      </header>
      {resultMessage ? <p className="dashboard-message" role="status">{resultMessage}</p> : null}
      <AdminCreatorLookup mode="plans" />
      <section className="dashboard-card">
        <p>
          Founding Creator grants do not require a referral or published storefront. Each grant uses one of
          the 50 programme slots and applies the three-month benefit. Pro Creator is not manually assignable;
          existing paid subscriptions must be managed through the configured payment provider.
        </p>
        <p>
          Changing to Creator does not count as consent to the 4% platform commission. If Razorpay
          reconnection or commission consent is required, the creator must complete that flow themselves.
        </p>
      </section>
    </div>
  );
}
