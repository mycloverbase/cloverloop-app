import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { moderateProductReviewAction } from "@/app/dashboard/admin/actions";
import { StarRating } from "@/components/reviews/star-rating";
import { requireCreatorContext } from "@/lib/account/server";
import "@/components/reviews/reviews.css";

export const metadata: Metadata = {
  title: "Review moderation | CloverLoop administration",
  robots: { index: false, follow: false },
};

type ReportRow = {
  report_id: string;
  report_status: string;
  reason: string;
  details: string;
  reported_at: string;
  review_id: string;
  review_status: string;
  rating: number;
  body: string;
  reviewer_name: string;
  submitted_at: string;
  product_id: string;
  product_name: string;
  storefront_username: string;
};

const reasonLabels: Record<string, string> = {
  spam: "Spam or advertising",
  offensive: "Offensive or abusive",
  fraudulent: "Fraudulent or fake",
  not_about_product: "Not about this product",
  other: "Something else",
};

const resultMessages: Record<string, string> = {
  hide: "Review hidden. Open reports for it were resolved.",
  restore: "Review restored to the product page.",
  dismiss_reports: "Reports dismissed. The review stays published.",
  invalid: "Choose a valid moderation action.",
  failed: "The moderation action could not be saved.",
};

export default async function ReviewModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; status?: string }>;
}) {
  const { supabase, user } = await requireCreatorContext();
  if (user.app_metadata?.role !== "admin") redirect("/dashboard");
  const { result, status } = await searchParams;
  const filter = status === "all" ? null : status === "resolved" || status === "dismissed" ? status : "open";

  const { data, error } = await supabase.rpc("admin_list_product_review_reports", { p_status: filter });
  if (error) {
    console.error("Could not load review reports.", { code: error.code });
    throw new Error("Review reports could not be loaded. Please try again.");
  }
  const reports = (Array.isArray(data) ? data : []) as ReportRow[];

  return (
    <div className="dashboard-page-content">
      <header className="dashboard-page-heading">
        <div>
          <span className="eyebrow">Admin-only</span>
          <h1>Review moderation</h1>
          <p>Creators can report reviews; only CloverLoop administrators can hide or restore them.</p>
        </div>
      </header>
      {result && resultMessages[result] ? <p className="dashboard-message" role="status">{resultMessages[result]}</p> : null}
      <nav className="dashboard-review-tags" aria-label="Report status">
        {[["open", "Open"], ["resolved", "Resolved"], ["dismissed", "Dismissed"], ["all", "All"]].map(([value, label]) => (
          <Link
            key={value}
            href={`/dashboard/admin/reviews?status=${value}`}
            className={`dashboard-review-tag${(filter ?? "all") === value ? "" : " is-muted"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {reports.length ? (
        <ol className="dashboard-review-list">
          {reports.map((report) => (
            <li className="dashboard-card dashboard-review" key={report.report_id}>
              <div className="dashboard-review-top">
                <div>
                  <strong>{report.reviewer_name}</strong>
                  <span className="dashboard-review-tags">
                    <span className="dashboard-review-tag is-warning">{reasonLabels[report.reason] ?? report.reason}</span>
                    <span className={`dashboard-review-tag${report.review_status === "hidden" ? " is-muted" : ""}`}>
                      Review {report.review_status}
                    </span>
                    <span className="dashboard-review-tag is-muted">Report {report.report_status}</span>
                  </span>
                </div>
                <Link href={`/${encodeURIComponent(report.storefront_username)}/product/${report.product_id}`} target="_blank" rel="noopener noreferrer">
                  {report.product_name}
                </Link>
              </div>
              <div className="product-review-meta">
                <StarRating value={report.rating} size={15} />
                <time dateTime={report.submitted_at}>
                  Reviewed {new Date(report.submitted_at).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}
                </time>
              </div>
              {report.body ? <p className="product-review-body">{report.body}</p> : null}
              {report.details ? <p className="product-review-body"><strong>Creator note:</strong> {report.details}</p> : null}
              <form action={moderateProductReviewAction} className="dashboard-review-report">
                <input type="hidden" name="review_id" value={report.review_id} />
                <label className="dashboard-field">
                  <span>Moderation note <em>Optional</em></span>
                  <textarea name="note" maxLength={500} rows={2} />
                </label>
                <div className="dashboard-card-links">
                  {report.review_status === "published" ? (
                    <button className="button" type="submit" name="moderation_action" value="hide">Hide review</button>
                  ) : (
                    <button className="button" type="submit" name="moderation_action" value="restore">Restore review</button>
                  )}
                  {report.report_status === "open" ? (
                    <button className="button button-secondary" type="submit" name="moderation_action" value="dismiss_reports">
                      Dismiss report
                    </button>
                  ) : null}
                </div>
              </form>
            </li>
          ))}
        </ol>
      ) : (
        <p className="dashboard-message" role="status">No {filter ?? ""} review reports.</p>
      )}
    </div>
  );
}
