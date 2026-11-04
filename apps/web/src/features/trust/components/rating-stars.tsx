import { Star } from "lucide-react";

/** Read-only star rating with a text equivalent (not colour alone). */
export function RatingStars({ rating, size = 15 }: { rating: number; size?: number }) {
  const rounded = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          aria-hidden="true"
          className={n <= rounded ? "fill-[#e0a526] text-[#e0a526]" : "text-[var(--nsr-control-outline)]"}
        />
      ))}
    </span>
  );
}
