import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, Store, UsersRound } from "lucide-react";
import { requireCreatorContext } from "@/lib/account/server";

export const metadata: Metadata = {
  title: "Admin dashboard | CloverLoop",
  robots: { index: false, follow: false },
};

const adminActions = [
  {
    href: "/dashboard/admin/plans",
    title: "Change creator plan",
    description: "Set Free or Creator, or enrol an eligible creator in the Founding Creator programme.",
    icon: UsersRound,
  },
  {
    href: "/dashboard/admin/founding-creators",
    title: "Founding Creator programme",
    description: "Review allocations, referrals, manual enrolments, and programme audit history.",
    icon: Crown,
  },
  {
    href: "/dashboard/admin/storefront-recovery",
    title: "Restore storefront",
    description: "Review pending storefront deletions and restore eligible storefronts as unpublished.",
    icon: Store,
  },
];

export default async function AdminDashboardPage() {
  const { user } = await requireCreatorContext();
  if (user.app_metadata?.role !== "admin") redirect("/dashboard");

  return (
    <div className="dashboard-page-content">
      <header className="dashboard-page-heading">
        <div>
          <span className="eyebrow">Admin-only</span>
          <h1>Admin dashboard</h1>
          <p>Manage creator accounts and platform operations.</p>
        </div>
      </header>
      <section className="dashboard-overview-grid dashboard-admin-actions" aria-label="Admin actions">
        {adminActions.map(({ href, title, description, icon: Icon }) => (
          <Link className="dashboard-card dashboard-admin-action" href={href} key={href}>
            <Icon size={21} aria-hidden="true" />
            <h2>{title}</h2>
            <p>{description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
