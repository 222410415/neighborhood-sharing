"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface MenuProps {
  trigger: React.ReactNode;
  items: MenuItem[];
  /** Accessible name, needed when the trigger shows only an icon or avatar. */
  label?: string;
  triggerClassName?: string;
}

export function Menu({ trigger, items, label, triggerClassName }: MenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          triggerClassName ??
          "inline-flex items-center gap-1 rounded-full text-[var(--nsr-text)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nsr-focus)]"
        }
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={cn(
            "absolute right-0 mt-2 min-w-[200px] z-30",
            "bg-[var(--nsr-surface)] rounded-[var(--nsr-radius-md)]",
            "border border-[var(--nsr-divider)] shadow-[0_18px_40px_-20px_rgba(15,30,26,0.35)]",
            "p-1.5",
          )}
        >
          {items.map((item, i) => (
            <button
              key={i}
              role="menuitem"
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
              className={cn(
                "block w-full text-left px-3 py-2.5 text-[15px] rounded-[var(--nsr-radius-sm)]",
                "transition-colors duration-[var(--nsr-transition-fast)]",
                "hover:bg-[var(--nsr-selected-background)]",
                "focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--nsr-focus)]",
                item.danger
                  ? "text-[var(--nsr-error)]"
                  : "text-[var(--nsr-text)]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
