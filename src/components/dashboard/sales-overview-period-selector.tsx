"use client";

import { useRouter } from "next/navigation";
import type { SalesOverviewPeriod } from "@/lib/dashboard/sales-overview";

export function SalesOverviewPeriodSelector({ period }: { period: SalesOverviewPeriod }) {
  const router = useRouter();

  function updatePeriod(value: string) {
    if (value !== "last_28_days" && value !== "lifetime") return;
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set("period", value);
    router.replace(`/dashboard?${searchParams.toString()}`, { scroll: false });
  }

  return (
    <label className="dashboard-sales-period-control" htmlFor="dashboard-sales-period">
      <span className="visually-hidden">Sales period</span>
      <select
        id="dashboard-sales-period"
        value={period}
        onChange={(event) => updatePeriod(event.currentTarget.value)}
      >
        <option value="last_28_days">Last 28 days</option>
        <option value="lifetime">Lifetime</option>
      </select>
    </label>
  );
}
