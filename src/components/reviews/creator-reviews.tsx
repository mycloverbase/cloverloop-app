import Link from "next/link";
import { ArrowUpRight, Flag, MessageSquareQuote, ShieldCheck, Star } from "lucide-react";
import { StarRating } from "@/components/reviews/star-rating";
import { reportReviewAction } from "@/app/dashboard/reviews/actions";
import "./reviews.css";

export type CreatorReview = {
  id: string;
  productId: string;
  productName: string;
  productUrl: string | null;
  reviewerName: string;
  rating: number;
  body: string;
  status: "published" | "hidden";
  submittedAt: string;
  reportStatus: "open" | "resolved" | "dismissed" | null;
};

const reportReasons = [
  ["spam", "Spam or advertising"],
  ["offensive", "Offensive or abusive"],
  ["fraudulent", "Fraudulent or fake"],
  ["not_about_product", "Not about this product"],
  ["other", "Something else"],
] as const;

function summarise(reviews: CreatorReview[]) {
  const published = reviews.filter((review) => review.status === "published");
  const average = published.length
    ? published.reduce((total, review) => total + review.rating, 0) / published.length
    : 0;
  const fiveStar = published.filter((review) => review.rating === 5).length;
  const products = new Map<string, { name: string; url: string | null; count: number; total: number }>();
  for (const review of published) {
    const entry = products.get(review.productId) ?? { name: review.productName, url: review.productUrl, count: 0, total: 0 };
    entry.count += 1;
    entry.total += review.rating;
    products.set(review.productId, entry);
  }
  return {
    count: published.length,
    average: Math.round(average * 10) / 10,
    fiveStarShare: published.length ? Math.round((fiveStar / published.length) * 100) : 0,
    products: [...products.entries()]
      .map(([id, entry]) => ({ id, ...entry, average: Math.round((entry.total / entry.count) * 10) / 10 }))
      .sort((first, second) => second.count - first.count),
  };
}

export function CreatorReviews({ reviews, notice }: { reviews: CreatorReview[]; notice?: string }) {
  const summary = summarise(reviews);
  return (
    <div className="dashboard-page-content">
      <header className="dashboard-page-heading">
        <div>
          <span className="eyebrow">Customer feedback</span>
          <h1>Reviews</h1>
          <p>Verified buyers are invited to review a product 5 days after a successful payment.</p>
        </div>
      </header>

      {notice ? <p className="dashboard-message" role="status">{notice}</p> : null}

      <section className="dashboard-review-summary-grid" aria-label="Review summary">
        <article className="dashboard-card dashboard-review-stat">
          <span className="dashboard-card-label">Average rating</span>
          <strong>{summary.count ? summary.average.toFixed(1) : "—"}</strong>
          {summary.count ? <StarRating value={summary.average} size={16} /> : null}
        </article>
        <article className="dashboard-card dashboard-review-stat">
          <span className="dashboard-card-label">Verified reviews</span>
          <strong>{summary.count.toLocaleString("en-IN")}</strong>
        </article>
        <article className="dashboard-card dashboard-review-stat">
          <span className="dashboard-card-label">5-star reviews</span>
          <strong>{summary.count ? `${summary.fiveStarShare}%` : "—"}</strong>
        </article>
      </section>

      {summary.products.length ? (
        <section className="dashboard-card" aria-labelledby="review-products-title">
          <div className="dashboard-card-heading">
            <div>
              <span className="dashboard-card-label">By product</span>
              <h2 id="review-products-title">Ratings per product</h2>
            </div>
          </div>
          <ul className="dashboard-review-products">
            {summary.products.map((product) => (
              <li key={product.id}>
                {product.url ? (
                  <Link href={product.url} target="_blank" rel="noopener noreferrer">{product.name}</Link>
                ) : (
                  <span>{product.name}</span>
                )}
                <StarRating value={product.average} size={14} />
                <span>{product.average.toFixed(1)} · {product.count} {product.count === 1 ? "review" : "reviews"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="review-list-title">
        <div className="dashboard-section-heading">
          <div>
            <span className="dashboard-card-label">Latest first</span>
            <h2 id="review-list-title">All reviews</h2>
          </div>
        </div>
        {reviews.length ? (
          <ol className="dashboard-review-list">
            {reviews.map((review) => (
              <li className="dashboard-card dashboard-review" key={review.id}>
                <div className="dashboard-review-top">
                  <div>
                    <strong>{review.reviewerName}</strong>
                    <span className="dashboard-review-tags">
                      <span className="dashboard-review-tag"><ShieldCheck size={12} aria-hidden="true" /> Verified Purchase</span>
                      {review.status === "hidden" ? <span className="dashboard-review-tag is-muted">Hidden by CloverLoop</span> : null}
                      {review.reportStatus === "open" ? <span className="dashboard-review-tag is-warning">Report under review</span> : null}
                      {review.reportStatus === "dismissed" ? <span className="dashboard-review-tag is-muted">Report reviewed – kept</span> : null}
                    </span>
                  </div>
                  {review.productUrl ? (
                    <Link href={review.productUrl} target="_blank" rel="noopener noreferrer">
                      {review.productName} <ArrowUpRight size={13} aria-hidden="true" />
                    </Link>
                  ) : (
                    <span>{review.productName}</span>
                  )}
                </div>
                <div className="product-review-meta">
                  <StarRating value={review.rating} size={15} />
                  <time dateTime={review.submittedAt}>
                    {new Date(review.submittedAt).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}
                  </time>
                </div>
                {review.body ? <p className="product-review-body">{review.body}</p> : null}
                {review.status === "published" && review.reportStatus !== "open" ? (
                  <details className="dashboard-review-report">
                    <summary><Flag size={13} aria-hidden="true" /> Report this review</summary>
                    <form action={reportReviewAction}>
                      <input type="hidden" name="review_id" value={review.id} />
                      <label className="dashboard-field">
                        <span>Reason</span>
                        <select name="reason" required defaultValue="">
                          <option value="" disabled>Choose a reason</option>
                          {reportReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <label className="dashboard-field">
                        <span>Details <em>Optional</em></span>
                        <textarea name="details" maxLength={1000} rows={3} />
                      </label>
                      <button type="submit" className="button button-secondary">Send report to CloverLoop</button>
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <div className="dashboard-card product-reviews-empty">
            <span aria-hidden="true"><MessageSquareQuote size={22} /></span>
            <div>
              <strong>No reviews yet</strong>
              <p>
                When buyers complete a paid purchase, CloverLoop emails them a private review link after 5 days.
                Their verified reviews will appear here and on your product pages.
              </p>
            </div>
          </div>
        )}
      </section>

      <p className="dashboard-review-policy">
        <Star size={14} aria-hidden="true" /> Reviews come only from verified paid orders. Creators can report a review,
        but only CloverLoop can moderate it, so reviews can&apos;t be edited or removed by the store owner.
      </p>
    </div>
  );
}
