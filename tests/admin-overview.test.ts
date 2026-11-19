import { describe, expect, it } from "vitest";
import { formatAdminOverviewMetrics } from "@/lib/dashboard/admin-overview";

describe("formatAdminOverviewMetrics", () => {
  it("formats all totals with Indian grouping and gross sales in rupees", () => {
    expect(formatAdminOverviewMetrics([{
      total_orders: "1234567",
      gross_sales_paise: "123456789",
      published_storefronts: "2345",
      total_creators: "678901",
    }])).toEqual({
      totalOrders: "12,34,567",
      grossSales: "₹12,34,567.89",
      publishedStorefronts: "2,345",
      totalCreators: "6,78,901",
    });
  });

  it("formats an empty summary as zero", () => {
    expect(formatAdminOverviewMetrics([{
      total_orders: "0",
      gross_sales_paise: "0",
      published_storefronts: "0",
      total_creators: "0",
    }])).toEqual({
      totalOrders: "0",
      grossSales: "₹0.00",
      publishedStorefronts: "0",
      totalCreators: "0",
    });
  });

  it("rejects malformed or incomplete aggregate results", () => {
    expect(formatAdminOverviewMetrics([])).toBeNull();
    expect(formatAdminOverviewMetrics([{
      total_orders: "1.5",
      gross_sales_paise: "100",
      published_storefronts: "2",
      total_creators: "3",
    }])).toBeNull();
  });
});
