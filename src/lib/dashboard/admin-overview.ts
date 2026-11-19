function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNonNegativeInteger(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

export function formatAdminOverviewMetrics(data: unknown): {
  totalOrders: string;
  grossSales: string;
  publishedStorefronts: string;
  totalCreators: string;
} | null {
  if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) return null;

  const row = data[0];
  const totalOrders = parseNonNegativeInteger(row.total_orders);
  const grossSalesPaise = parseNonNegativeInteger(row.gross_sales_paise);
  const publishedStorefronts = parseNonNegativeInteger(row.published_storefronts);
  const totalCreators = parseNonNegativeInteger(row.total_creators);
  if (
    totalOrders === null ||
    grossSalesPaise === null ||
    publishedStorefronts === null ||
    totalCreators === null
  ) {
    return null;
  }

  const paisePerRupee = BigInt(100);
  const rupees = grossSalesPaise / paisePerRupee;
  const paise = (grossSalesPaise % paisePerRupee).toString().padStart(2, "0");
  const formatCount = (value: bigint) => new Intl.NumberFormat("en-IN").format(value);

  return {
    totalOrders: formatCount(totalOrders),
    grossSales: `₹${formatCount(rupees)}.${paise}`,
    publishedStorefronts: formatCount(publishedStorefronts),
    totalCreators: formatCount(totalCreators),
  };
}
