function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNonNegativeInteger(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

export function formatSalesOverview(data: unknown): {
  revenue: string;
  sales: string;
} | null {
  if (!Array.isArray(data) || data.length !== 1) return null;
  const row = data[0];
  if (!isRecord(row)) return null;
  const grossSalesPaise = parseNonNegativeInteger(row.gross_sales_paise);
  const saleCount = parseNonNegativeInteger(row.sale_count);
  if (grossSalesPaise === null || saleCount === null) return null;

  const paisePerRupee = BigInt(100);
  const rupees = grossSalesPaise / paisePerRupee;
  const paise = (grossSalesPaise % paisePerRupee).toString().padStart(2, "0");

  return {
    revenue: `₹${new Intl.NumberFormat("en-IN").format(rupees)}.${paise}`,
    sales: new Intl.NumberFormat("en-IN").format(saleCount),
  };
}
