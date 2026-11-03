"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface ImageFrameProps {
  src: string;
  alt: string;
  aspectRatio?: "square" | "video";
  className?: string;
  fallback?: React.ReactNode;
}

export function ImageFrame({
  src,
  alt,
  aspectRatio = "video",
  className,
  fallback,
}: ImageFrameProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // An image the browser already has shows at once, before the first paint.
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, [src]);

  const ratioClass =
    aspectRatio === "square" ? "aspect-square" : "aspect-video";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--nsr-radius-lg)] bg-[var(--nsr-divider)]",
        ratioClass,
        className,
      )}
    >
      {!loaded && !error && (
        <div className="absolute inset-0 animate-pulse bg-[var(--nsr-divider)]" />
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          {fallback ?? (
            <span className="text-[13px] text-[var(--nsr-text-secondary)]">
              Image unavailable
            </span>
          )}
        </div>
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={cn(
          "h-full w-full object-cover",
          "transition-opacity duration-[var(--nsr-transition-fast)]",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
