"use client";

import { useAuth } from "@/features/auth/auth-context";
import { AvatarInitials } from "@/components/ui/avatar-initials";

export function useDisplayUser() {
  const { user } = useAuth();

  if (!user) {
    return { user: null, displayName: "", initials: "" };
  }

  const displayName =
    user.displayName ??
    user.email?.split("@")[0] ??
    "User";
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return { user, displayName, initials };
}

export { AvatarInitials };
