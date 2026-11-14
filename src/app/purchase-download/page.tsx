import type { Metadata } from "next";
import { PurchaseDownload } from "@/components/purchase-download";

export const metadata: Metadata = {
  title: "Secure purchase download | CloverLoop",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PurchaseDownloadPage() {
  return <PurchaseDownload />;
}
