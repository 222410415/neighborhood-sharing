"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/features/auth/auth-context";
import { apiFetch } from "@/lib/api-client";

interface ProfileData {
  setupNeeded: boolean;
  profile?: {
    uid: string;
    email: string;
    displayName: string;
    neighborhoodId: string | null;
    preferredLocale: string;
    biographyEn?: string;
    biographyAr?: string;
    verificationStatus: string;
    completedProfile: boolean;
    createdAt?: string;
    profileMediaId?: string | null;
    privacyPreferences?: { showNeighborhood: boolean; showReviews: boolean };
    notificationPreferences?: { messages: boolean; community: boolean; alerts: boolean };
  };
}

export function useProfile() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiFetch<ProfileData>("/me");
    setLoading(false);
    if (res.data) {
      setProfile(res.data);
    } else if (res.error) {
      setError(res.error.message);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchProfile();
    } else if (!authLoading && !user) {
      setProfile(null);
    }
  }, [authLoading, user, fetchProfile]);

  const createProfile = useCallback(
    async (displayName: string, neighborhoodId: string) => {
      const res = await apiFetch<ProfileData>("/me/profile", {
        method: "PUT",
        body: { displayName, neighborhoodId },
      });
      if (res.data) {
        await fetchProfile();
        return res.data;
      }
      throw res.error;
    },
    [fetchProfile],
  );

  const updateProfile = useCallback(
    async (updates: {
      displayName?: string;
      neighborhoodId?: string;
      biographyEn?: string;
      profileMediaId?: string | null;
      privacyPreferences?: { showNeighborhood: boolean; showReviews: boolean };
      notificationPreferences?: { messages: boolean; community: boolean; alerts: boolean };
    }) => {
      const res = await apiFetch<ProfileData>("/me/profile", {
        method: "PATCH",
        body: updates,
      });
      if (res.data) {
        await fetchProfile();
        return res.data;
      }
      throw res.error;
    },
    [fetchProfile],
  );

  return {
    profile,
    loading,
    error,
    fetchProfile,
    createProfile,
    updateProfile,
  };
}
