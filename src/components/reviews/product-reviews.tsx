import { MessageSquareQuote, ShieldCheck } from "lucide-react";
import { StarRating } from "@/components/reviews/star-rating";
import type { ProductReviewSummary, PublicProductReview } from "@/lib/reviews/public";
import "./reviews.css";

export type ProductReviewData = {
  summary: ProductReviewSummary | null;
  reviews: PublicProductReview[];
};

function reviewDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function reviewCountLabel(count: number) {
  return `${count.toLocaleString("en-IN")} verified ${count === 1 ? "review" : "reviews"}`;
}

export function ProductRatingBadge({ summary }: { summary: ProductReviewSummary | null }) {
  if (!summary) return null;
  return (
    <a className="product-rating-badge" href="#reviews">
      <StarRating value={summary.averageRating} size={15} />
      <strong>{summary.averageRating.toFixed(1)}</strong>
      <span>({reviewCountLabel(summary.reviewCount)})</span>
    </a>
  );
}

export function ProductReviews({ data }: { data: ProductReviewData }) {
  const { summary, reviews } = data;
  return (
    <section className="product-reviews" id="reviews" aria-labelledby="product-reviews-title">
      <div className="product-reviews-heading">
        <h2 id="product-reviews-title">Customer reviews</h2>
        {summary ? <span>{reviewCountLabel(summary.reviewCount)}</span> : null}
      </div>

      {summary ? (
        <div className="product-reviews-layout">
          <div className="product-reviews-summary">
            <div className="product-reviews-score">
              <strong>{summary.averageRating.toFixed(1)}</strong>
              <div>
                <StarRating value={summary.averageRating} size={18} />
                <small>out of 5 · {reviewCountLabel(summary.reviewCount)}</small>
              </div>
            </div>
            <ul className="product-reviews-distribution" aria-label="Rating distribution">
              {([5, 4, 3, 2, 1] as const).map((stars) => {
                const total = summary.distribution[stars];
                const share = summary.reviewCount ? Math.round((total / summary.reviewCount) * 100) : 0;
                return (
                  <li key={stars}>
                    <span>{stars} star</span>
                    <span className="product-reviews-bar" aria-hidden="true">
                      <span style={{ width: `${share}%` }} />
                    </span>
                    <span className="product-reviews-bar-count">
                      {total}
                      <span className="sr-only"> {total === 1 ? "review" : "reviews"} ({share}%)</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="product-reviews-note">
              <ShieldCheck size={15} aria-hidden="true" />
              Only buyers with a verified paid order can review.
            </p>
          </div>

          <ol className="product-reviews-list">
            {reviews.map((review) => (
              <li className="product-review" key={review.id}>
                <div className="product-review-header">
                  <span className="product-review-avatar" aria-hidden="true">
                    {review.reviewerName.trim().charAt(0).toUpperCase() || "B"}
                  </span>
                  <div>
                    <strong>{review.reviewerName}</strong>
                    {review.verifiedPurchase ? (
                      <span className="product-review-verified">
                        <ShieldCheck size={13} aria-hidden="true" /> Verified Purchase
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="product-review-meta">
                  <StarRating value={review.rating} size={15} />
                  <time dateTime={review.submittedAt}>{reviewDate(review.submittedAt)}</time>
                </div>
                {review.body ? <p className="product-review-body">{review.body}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="product-reviews-empty">
          <span aria-hidden="true"><MessageSquareQuote size={22} /></span>
          <div>
            <strong>No reviews yet</strong>
            <p>
              Reviews come only from verified buyers. After purchasing, you&apos;ll receive an email
              invitation to share your experience.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
