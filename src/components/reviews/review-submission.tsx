"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, LoaderCircle, ShieldCheck, Star } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { StarRating } from "@/components/reviews/star-rating";
import {
  REVIEW_BODY_MAX_LENGTH,
  REVIEWER_NAME_MAX_LENGTH,
  validateReviewInput,
} from "@/lib/reviews/validation";
import "./reviews.css";

type InvitationState = "valid" | "invalid" | "expired" | "used" | "already_reviewed" | "ineligible";

type Invitation = {
  state: InvitationState;
  product: { name: string; description: string; coverImageUrl: string | null; url: string | null };
  creatorName: string;
  suggestedName: string;
};

type Phase =
  | { kind: "loading" }
  | { kind: "unavailable"; state: InvitationState | "error"; message?: string }
  | { kind: "form"; invitation: Invitation }
  | { kind: "preview"; invitation: Invitation }
  | { kind: "done"; invitation: Invitation; productUrl: string | null };

const STORAGE_KEY = "cloverloop-review-token";
const ratingLabels = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

const unavailableCopy: Record<InvitationState | "error", { title: string; body: string }> = {
  invalid: {
    title: "This review link isn't valid",
    body: "Open the link from your review invitation email again. If it still doesn't work, contact support.",
  },
  expired: {
    title: "This review link has expired",
    body: "Review links stay active for a limited time to keep them secure.",
  },
  used: {
    title: "Thanks, your review is already in",
    body: "A review has already been submitted for this purchase.",
  },
  already_reviewed: {
    title: "You've already reviewed this product",
    body: "We keep one review per buyer for each product, so your earlier review still stands.",
  },
  ineligible: {
    title: "This purchase can't be reviewed",
    body: "Only completed, paid purchases can be reviewed. Refunded orders aren't eligible.",
  },
  valid: { title: "", body: "" },
  error: {
    title: "Something went wrong",
    body: "We couldn't load your review invitation. Check your connection and try again.",
  },
};

function readToken(): string {
  const fragment = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
  if (/^[A-Za-z0-9_-]{43}$/.test(fragment)) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, fragment);
    } catch {}
    window.history.replaceState(null, "", window.location.pathname);
    return fragment;
  }
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function ReviewSubmission() {
  const [token, setToken] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [body, setBody] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const currentToken = readToken();
    let cancelled = false;
    async function load() {
      if (!currentToken) {
        setPhase({ kind: "unavailable", state: "invalid" });
        return;
      }
      setToken(currentToken);
      try {
        const response = await fetch("/api/reviews/invitation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ token: currentToken }),
        });
        const result: unknown = await response.json();
        if (cancelled) return;
        if (!result || typeof result !== "object") throw new Error("invalid");
        const data = result as Partial<Invitation> & { error?: string };
        if (response.ok && data.state === "valid" && data.product && typeof data.creatorName === "string") {
          setReviewerName(data.suggestedName ?? "");
          setPhase({ kind: "form", invitation: data as Invitation });
          return;
        }
        const state = (data.state && data.state in unavailableCopy ? data.state : response.status >= 500 ? "error" : "invalid") as InvitationState | "error";
        setPhase({ kind: "unavailable", state });
      } catch {
        if (!cancelled) setPhase({ kind: "unavailable", state: "error" });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function goToPreview(event: FormEvent<HTMLFormElement>, invitation: Invitation) {
    event.preventDefault();
    const validation = validateReviewInput({ rating, body, reviewerName });
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setError("");
    setPhase({ kind: "preview", invitation });
  }

  async function submit(invitation: Invitation) {
    const validation = validateReviewInput({ rating, body, reviewerName });
    if (!validation.ok) {
      setError(validation.error);
      setPhase({ kind: "form", invitation });
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token, ...validation.review }),
      });
      const result = (await response.json()) as { ok?: boolean; productUrl?: string | null; error?: string; state?: string };
      if (response.ok && result.ok) {
        try {
          window.sessionStorage.removeItem(STORAGE_KEY);
        } catch {}
        setPhase({ kind: "done", invitation, productUrl: result.productUrl ?? invitation.product.url });
        return;
      }
      if (result.state && result.state in unavailableCopy) {
        setPhase({ kind: "unavailable", state: result.state as InvitationState });
        return;
      }
      setError(result.error ?? "Your review could not be saved. Please try again.");
    } catch {
      setError("We couldn't reach CloverLoop. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (phase.kind === "loading") {
    return (
      <section className="free-product-download-card download-state-loading" aria-live="polite">
        <span className="download-state-icon" aria-hidden="true"><LoaderCircle className="spin" size={22} /></span>
        <span className="eyebrow">Verified review</span>
        <h1>Checking your review link</h1>
        <p>This only takes a moment.</p>
      </section>
    );
  }

  if (phase.kind === "unavailable") {
    const copy = unavailableCopy[phase.state];
    const positive = phase.state === "used" || phase.state === "already_reviewed";
    return (
      <section className={`free-product-download-card ${positive ? "download-state-ready" : "download-state-error"}`} aria-live="polite">
        <span className="download-state-icon" aria-hidden="true">
          {positive ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />}
        </span>
        <span className="eyebrow">Verified review</span>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <Link className="button button-secondary" href="/">Go to CloverLoop</Link>
      </section>
    );
  }

  const { invitation } = phase;
  const productHeader = (
    <div className="review-submit-product">
      {invitation.product.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={invitation.product.coverImageUrl} alt="" />
      ) : (
        <span className="review-submit-product-placeholder" aria-hidden="true" />
      )}
      <div>
        <strong>{invitation.product.name}</strong>
        <span>by {invitation.creatorName}</span>
      </div>
    </div>
  );

  if (phase.kind === "done") {
    return (
      <section className="review-submit-card" aria-live="polite">
        {productHeader}
        <div className="review-submit-body review-submit-success">
          <span className="download-state-icon" aria-hidden="true"><CheckCircle2 size={22} /></span>
          <h1>Thank you for your review!</h1>
          <p>Your verified review helps other buyers and supports {invitation.creatorName}.</p>
          {phase.productUrl ? (
            <Link className="button" href={phase.productUrl}>View the product page</Link>
          ) : (
            <Link className="button button-secondary" href="/">Go to CloverLoop</Link>
          )}
        </div>
      </section>
    );
  }

  const shownRating = hoverRating || rating;

  if (phase.kind === "preview") {
    return (
      <section className="review-submit-card" aria-live="polite">
        {productHeader}
        <div className="review-submit-body">
          <h1>Preview your review</h1>
          <p>This is how your review will appear on the product page.</p>
          <div className="review-preview">
            <span>Preview</span>
            <div className="product-review">
              <div className="product-review-header">
                <span className="product-review-avatar" aria-hidden="true">{reviewerName.trim().charAt(0).toUpperCase()}</span>
                <div>
                  <strong>{reviewerName.trim()}</strong>
                  <span className="product-review-verified"><ShieldCheck size={13} aria-hidden="true" /> Verified Purchase</span>
                </div>
              </div>
              <div className="product-review-meta">
                <StarRating value={rating} size={15} />
                <time>Today</time>
              </div>
              {body.trim() ? <p className="product-review-body">{body.trim()}</p> : null}
            </div>
          </div>
          {error ? <p className="review-submit-error" role="alert">{error}</p> : null}
          <div className="review-submit-actions">
            <button type="button" className="button button-secondary" onClick={() => setPhase({ kind: "form", invitation })} disabled={submitting}>
              Edit review
            </button>
            <button type="button" className="button" onClick={() => void submit(invitation)} disabled={submitting}>
              {submitting ? <><LoaderCircle className="spin" size={17} aria-hidden="true" /> Submitting…</> : "Submit review"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="review-submit-card">
      {productHeader}
      <form className="review-submit-body" onSubmit={(event) => goToPreview(event, invitation)} noValidate>
        <h1>How would you rate it?</h1>
        <p>Share your honest experience. Your email address is never shown.</p>

        <fieldset className="review-star-input">
          <legend>Your rating</legend>
          <div className="review-star-options" onMouseLeave={() => setHoverRating(0)}>
            {[1, 2, 3, 4, 5].map((value) => (
              <label
                key={value}
                className={value <= shownRating ? "is-active" : ""}
                onMouseEnter={() => setHoverRating(value)}
              >
                <input
                  type="radio"
                  name="rating"
                  value={value}
                  checked={rating === value}
                  onChange={() => setRating(value)}
                  aria-label={`${value} star${value === 1 ? "" : "s"} – ${ratingLabels[value]}`}
                />
                <Star size={30} strokeWidth={1.6} aria-hidden="true" />
              </label>
            ))}
            <span className="review-star-caption" aria-live="polite">{shownRating ? ratingLabels[shownRating] : "Select a rating"}</span>
          </div>
        </fieldset>

        <label className="review-field">
          <span>Your review <em style={{ color: "#6b786f", fontStyle: "normal", fontWeight: 500 }}>(optional)</em></span>
          <textarea
            value={body}
            maxLength={REVIEW_BODY_MAX_LENGTH}
            onChange={(event) => setBody(event.target.value)}
            placeholder="What did you like? How did it help you?"
          />
          <span className="review-field-meta">
            <small>Please don&apos;t include personal contact details.</small>
            <small>{body.trim().length}/{REVIEW_BODY_MAX_LENGTH.toLocaleString("en-IN")}</small>
          </span>
        </label>

        <label className="review-field">
          <span>Display name</span>
          <input
            value={reviewerName}
            maxLength={REVIEWER_NAME_MAX_LENGTH}
            onChange={(event) => setReviewerName(event.target.value)}
            autoComplete="nickname"
          />
          <small>Shown publicly with your review.</small>
        </label>

        {error ? <p className="review-submit-error" role="alert">{error}</p> : null}

        <div className="review-submit-actions">
          <button type="submit" className="button">Preview review</button>
        </div>
      </form>
    </section>
  );
}
