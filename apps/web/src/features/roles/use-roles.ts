"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-context";
import { fetchMyRoles, type Roles } from "@/features/trust/trust-api";

/** The signed-in member's roles; only used to show links. The API enforces access. */
export function useRoles(): Roles | null {
  const { user } = useAuth();
  const [roles, setRoles] = useState<Roles | null>(null);
  useEffect(() => {
    if (!user) {
      setRoles(null);
      return;
    }
    let active = true;
    fetchMyRoles().then((res) => {
      if (active) setRoles(res.data);
    });
    return () => {
      active = false;
    };
  }, [user]);
  return roles;
}
