import { describe, expect, it } from "vitest";
import { formatSalesOverview } from "@/lib/dashboard/sales-overview";

describe("formatSalesOverview", () => {
  it("formats paise and transaction counts using Indian number grouping", () => {
    expect(formatSalesOverview([{
      gross_sales_paise: "123456789",
      sale_count: "1234567",
    }])).toEqual({
      revenue: "₹12,34,567.89",
      sales: "12,34,567",
    });
  });

  it("formats an empty sales summary as zero", () => {
    expect(formatSalesOverview([{
      gross_sales_paise: "0",
      sale_count: "0",
    }])).toEqual({
      revenue: "₹0.00",
      sales: "0",
    });
  });

  it("rejects malformed or incomplete aggregate results", () => {
    expect(formatSalesOverview([])).toBeNull();
    expect(formatSalesOverview([{
      gross_sales_paise: "1.5",
      sale_count: "1",
    }])).toBeNull();
  });
});
