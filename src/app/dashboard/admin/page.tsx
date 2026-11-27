import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChartNoAxesCombined, Crown, ShoppingBag, Store, UsersRound } from "lucide-react";
import { formatAdminOverviewMetrics } from "@/lib/dashboard/admin-overview";
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
  const { supabase, user } = await requireCreatorContext();
  if (user.app_metadata?.role !== "admin") redirect("/dashboard");

  const { data, error } = await supabase.rpc("admin_get_overview_metrics");
  if (error) {
    console.error("Could not load admin overview metrics.", { code: error.code });
    throw new Error("Admin overview metrics could not be loaded. Please try again.");
  }
  const metrics = formatAdminOverviewMetrics(data);
  if (!metrics) {
    console.error("Admin overview metrics returned an invalid response.");
    throw new Error("Admin overview metrics could not be loaded. Please try again.");
  }

  const overviewCards = [
    { label: "Total orders", value: metrics.totalOrders, icon: ShoppingBag },
    { label: "Total gross sales", value: metrics.grossSales, icon: ChartNoAxesCombined },
    { label: "Published storefronts", value: metrics.publishedStorefronts, icon: Store },
    { label: "Total users", value: metrics.totalCreators, icon: UsersRound },
  ];

  return (
    <div className="dashboard-page-content">
      <header className="dashboard-page-heading">
        <div>
          <span className="eyebrow">Admin-only</span>
          <h1>Platform overview</h1>
          <p>Key CloverLoop activity for the last 28 days.</p>
        </div>
      </header>
      <section className="dashboard-overview-grid admin-overview-grid" aria-label="Platform metrics for the last 28 days">
        {overviewCards.map(({ label, value, icon: Icon }) => (
          <article className="dashboard-card admin-overview-card" key={label}>
            <div className="admin-overview-icon"><Icon size={20} aria-hidden="true" /></div>
            <span className="dashboard-card-label">{label}</span>
            <strong className="admin-overview-value">{value}</strong>
            <span className="admin-overview-period">Last 28 days</span>
          </article>
        ))}
      </section>
      <h2 className="admin-tools-heading">Admin tools</h2>
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
