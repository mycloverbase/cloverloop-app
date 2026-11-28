export const REVIEW_BODY_MAX_LENGTH = 2000;
export const REVIEWER_NAME_MAX_LENGTH = 60;

export type ReviewInput = {
  rating: number;
  body: string;
  reviewerName: string;
};

export function normaliseReviewerName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function defaultReviewerName(customerName: string | null | undefined): string {
  const parts = normaliseReviewerName(customerName ?? "").split(" ").filter(Boolean);
  if (!parts.length) return "Verified buyer";
  const first = parts[0].slice(0, 40);
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0]?.toUpperCase()}.` : "";
  return `${first}${lastInitial}`;
}

export function validateReviewInput(
  value: unknown,
): { ok: true; review: ReviewInput } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Invalid review." };
  }
  const { rating, body, reviewerName } = value as Record<string, unknown>;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Choose a rating from 1 to 5 stars." };
  }
  if (body !== undefined && typeof body !== "string") {
    return { ok: false, error: "Invalid review text." };
  }
  const trimmedBody = (body ?? "").trim();
  if (trimmedBody.length > REVIEW_BODY_MAX_LENGTH) {
    return { ok: false, error: `Keep your review under ${REVIEW_BODY_MAX_LENGTH.toLocaleString("en-IN")} characters.` };
  }
  if (typeof reviewerName !== "string") {
    return { ok: false, error: "Add the name to show with your review." };
  }
  const name = normaliseReviewerName(reviewerName);
  if (!name.length || name.length > REVIEWER_NAME_MAX_LENGTH) {
    return { ok: false, error: `Use a display name of 1–${REVIEWER_NAME_MAX_LENGTH} characters.` };
  }
  if (/[<>]/.test(name)) {
    return { ok: false, error: "Display names cannot include < or >." };
  }
  return { ok: true, review: { rating, body: trimmedBody, reviewerName: name } };
}
