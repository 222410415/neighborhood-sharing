"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImageUpload } from "@/components/ui/image-upload";
import { memberPhotoUrl } from "@/features/trust/trust-api";
import { ContentContainer } from "@/components/layout/content-container";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { useAuth } from "@/features/auth/auth-context";
import { RIYADH_NEIGHBORHOODS } from "@/lib/catalogue-options";
import { useProfile } from "@/features/profile/use-profile";
import { useRoles } from "@/features/roles/use-roles";

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading, logOut } = useAuth();
  const { profile, loading: profileLoading, updateProfile } = useProfile();
  const roles = useRoles();

  const [displayName, setDisplayName] = useState("");
  const [neighborhoodId, setNeighborhoodId] = useState("");
  const [biography, setBiography] = useState("");
  const [showNeighborhood, setShowNeighborhood] = useState(false);
  const [showReviews, setShowReviews] = useState(true);
  const [notifyMessages, setNotifyMessages] = useState(true);
  const [notifyCommunity, setNotifyCommunity] = useState(true);
  const [notifyAlerts, setNotifyAlerts] = useState(true);
  const [photoMediaIds, setPhotoMediaIds] = useState<string[]>([]);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/sign-in");
    }
  }, [authLoading, user, router]);

  // Populate form from profile
  useEffect(() => {
    if (profile?.profile) {
      setDisplayName(profile.profile.displayName ?? "");
      setNeighborhoodId(profile.profile.neighborhoodId ?? "");
      setBiography(profile.profile.biographyEn ?? "");
      setShowNeighborhood(profile.profile.privacyPreferences?.showNeighborhood ?? false);
      setShowReviews(profile.profile.privacyPreferences?.showReviews ?? true);
      setNotifyMessages(profile.profile.notificationPreferences?.messages ?? true);
      setNotifyCommunity(profile.profile.notificationPreferences?.community ?? true);
      setNotifyAlerts(profile.profile.notificationPreferences?.alerts ?? true);
    }
  }, [profile]);

  const savePhoto = async (mediaId: string | null) => {
    setPhotoMessage(null);
    try {
      await updateProfile({ profileMediaId: mediaId });
      setPhotoMediaIds([]);
      setPhotoMessage(mediaId ? "Profile photo updated." : "Profile photo removed.");
    } catch (err: any) {
      setPhotoMessage(err?.fieldErrors?.[0]?.message ?? err?.message ?? "The photo could not be saved.");
    }
  };

  const email = user?.email ?? "";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setFieldErrors({});

    setSaving(true);

    try {
      await updateProfile({
        displayName,
        neighborhoodId,
        biographyEn: biography,
        privacyPreferences: { showNeighborhood, showReviews },
        notificationPreferences: {
          messages: notifyMessages,
          community: notifyCommunity,
          alerts: notifyAlerts,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      if (err?.fieldErrors) {
        const fe: Record<string, string> = {};
        for (const f of err.fieldErrors) {
          fe[f.field] = f.message;
        }
        setFieldErrors(fe);
      } else {
        setError(err?.message ?? "Failed to save. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || profileLoading) {
    return (
      <ContentContainer>
        <div className="max-w-2xl mx-auto py-8">
          <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--nsr-divider)] mb-4" />
          <div className="h-11 w-full animate-pulse rounded-[var(--nsr-radius-md)] bg-[var(--nsr-divider)] mb-4" />
          <div className="h-11 w-full animate-pulse rounded-[var(--nsr-radius-md)] bg-[var(--nsr-divider)]" />
        </div>
      </ContentContainer>
    );
  }

  if (!user) return null;

  return (
    <ContentContainer>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <AvatarInitials name={displayName || "User"} size="lg" />
          <div>
            <h1 className="page-title">
              Your profile
            </h1>
            <p className="text-[14px] text-[var(--nsr-text-secondary)]">
              {email}
            </p>
          </div>
        {/* On phones the tab bar leads here, so these replace the account menu. */}
        <nav className="account-links form-section" aria-label="Your account">
          <ul className="activity-list">
            {[
              { href: "/my-listings", label: "My listings" },
              { href: "/favorites", label: "Saved items" },
              { href: "/requests", label: "Community requests" },
              { href: "/reports", label: "Your reports" },
              { href: "/policies", label: "Policies" },
              ...(roles?.isReviewer ? [{ href: "/admin", label: "Review workspace" }] : []),
            ].map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="block py-3 font-medium text-[var(--nsr-text)] no-underline">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="block w-full border-0 bg-transparent py-3 text-left font-medium text-[var(--nsr-error)]"
                onClick={async () => {
                  await logOut();
                  router.push("/");
                }}
              >
                Sign out
              </button>
            </li>
          </ul>
        </nav>
        </div>

        {error && (
          <div className="mb-4">
            <Alert variant="error">{error}</Alert>
          </div>
        )}
        {saved && (
          <div className="mb-4">
            <Alert variant="success" title="Changes saved">
              Your profile has been updated.
            </Alert>
          </div>
        )}

        <form
          onSubmit={handleSave}
          className="form-section flex flex-col gap-5"
        >
          <Field
            label="Display name"
            name="displayName"
            value={displayName}
            required
            error={fieldErrors["displayName"]}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <div>
            <label className="text-[14px] font-medium text-[var(--nsr-text)] block mb-1.5">
              Email (private)
            </label>
            <p className="text-[15px] text-[var(--nsr-text-secondary)] h-11 flex items-center px-3 bg-[var(--nsr-disabled-background)] rounded-[var(--nsr-radius-md)]">
              {email}
            </p>
            <p className="text-[13px] text-[var(--nsr-text-secondary)] mt-1">
              Your email is private and not shown to other users.
            </p>
          </div>
          <Select
            label="Neighborhood"
            name="neighborhoodId"
            value={neighborhoodId}
            error={fieldErrors["neighborhoodId"]}
            onChange={(e) => setNeighborhoodId(e.target.value)}
          >
            <option value="">Select a neighborhood</option>
            {RIYADH_NEIGHBORHOODS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </Select>
          <Field
            label="Biography (optional)"
            name="biography"
            value={biography}
            placeholder="Tell neighbors a bit about yourself"
            multiline
            onChange={(e) => setBiography(e.target.value)}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[14px] font-medium mb-1">Privacy</legend>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={showNeighborhood} onChange={(e) => setShowNeighborhood(e.target.checked)} />
              Show my neighborhood on my public profile
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={showReviews} onChange={(e) => setShowReviews(e.target.checked)} />
              Show review comments on my public profile (the rating summary is always shown)
            </label>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[14px] font-medium mb-1">In-app notifications</legend>
            <p className="text-[12px] text-[var(--nsr-text-secondary)]">
              Booking and case notices are always on. These are optional:
            </p>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={notifyMessages} onChange={(e) => setNotifyMessages(e.target.checked)} />
              New messages
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={notifyCommunity} onChange={(e) => setNotifyCommunity(e.target.checked)} />
              Community requests and offers
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={notifyAlerts} onChange={(e) => setNotifyAlerts(e.target.checked)} />
              Availability alerts for saved items
            </label>
          </fieldset>
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </div>
        </form>

        <section className="form-section">
          <h2>Profile photo</h2>
          <p>Optional. Shown on your public profile.</p>
          {profile?.profile?.profileMediaId && (
            <div className="mb-3 flex items-center gap-3">
              <img
                src={memberPhotoUrl(user.uid, "thumbnail")}
                alt="Your current profile photo"
                className="h-16 w-16 rounded-full object-cover border border-[var(--nsr-divider)]"
              />
              <Button size="sm" variant="secondary" onClick={() => savePhoto(null)}>
                Remove photo
              </Button>
            </div>
          )}
          <ImageUpload
            mediaIds={photoMediaIds}
            onMediaIdsChange={setPhotoMediaIds}
            clientSubmissionPrefix={`profile-${user.uid}`}
            purpose="profile"
            onUploaded={(mediaId) => savePhoto(mediaId)}
          />
          {photoMessage && <p className="mt-2 text-[13px]">{photoMessage}</p>}
        </section>

        <section className="form-section">
          <h2>Trust</h2>
          <div className="flex flex-wrap gap-4 text-[14px] font-semibold">
            <Link href="/profile/verification" className="text-[var(--nsr-link)]">
              Verification
            </Link>
            <Link href={`/members/${user.uid}`} className="text-[var(--nsr-link)]">
              Your public profile and reviews
            </Link>
            <Link href="/reports" className="text-[var(--nsr-link)]">
              Your reports
            </Link>
          </div>
        </section>
      </div>
    </ContentContainer>
  );
}
