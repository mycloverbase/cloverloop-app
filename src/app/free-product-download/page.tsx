import type { Metadata } from "next";
import { FreeProductDownload } from "@/components/free-product-download";

export const metadata: Metadata = {
  title: "Secure download | CloverLoop",
  robots: { index: false, follow: false },
};

export default function FreeProductDownloadPage() {
  return <FreeProductDownload />;
}
