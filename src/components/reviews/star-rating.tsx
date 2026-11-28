import { Star } from "lucide-react";

export function StarRating({
  value,
  size = 16,
  label,
}: {
  value: number;
  size?: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  const stars = [0, 1, 2, 3, 4];
  return (
    <span
      className="star-rating"
      role="img"
      aria-label={label ?? `Rated ${clamped.toLocaleString("en-IN", { maximumFractionDigits: 1 })} out of 5`}
      style={{ "--star-size": `${size}px` } as React.CSSProperties}
    >
      <span className="star-rating-base" aria-hidden="true">
        {stars.map((index) => <Star key={index} size={size} strokeWidth={1.6} />)}
      </span>
      <span className="star-rating-fill" aria-hidden="true" style={{ width: `${(clamped / 5) * 100}%` }}>
        {stars.map((index) => <Star key={index} size={size} strokeWidth={1.6} />)}
      </span>
    </span>
  );
}
