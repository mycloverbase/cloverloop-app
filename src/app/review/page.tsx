import type { Metadata } from "next";
import { DownloadShell } from "@/components/purchase-download";
import { ReviewSubmission } from "@/components/reviews/review-submission";

export const metadata: Metadata = {
  title: "Write a review | CloverLoop",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ReviewPage() {
  return (
    <DownloadShell>
      <ReviewSubmission />
    </DownloadShell>
  );
}
