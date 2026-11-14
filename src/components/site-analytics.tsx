"use client";

import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";

export function SiteAnalytics() {
  const pathname = usePathname();
  if (pathname === "/free-product-download" || pathname === "/purchase-download") return null;
  return <Analytics />;
}
