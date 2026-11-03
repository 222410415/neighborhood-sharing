"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    dialogRef.current?.focus();

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-w-md mx-4",
          "bg-[var(--nsr-surface)] rounded-[var(--nsr-radius-xl)]",
          "p-6 shadow-lg",
          "animate-[dialog-in_200ms_var(--nsr-easing,ease-out)]",
        )}
      >
        <h2 id="dialog-title" className="text-[18px] font-semibold text-[var(--nsr-text)] mb-4">
          {title}
        </h2>
        <div className="text-[15px] text-[var(--nsr-text)]">{children}</div>
      </div>
    </div>
  );
}
