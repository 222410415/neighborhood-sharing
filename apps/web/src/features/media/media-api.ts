// Media API client — upload, read, delete for images.

export interface MediaMeta {
  mediaId: string;
  ownerUid: string;
  listingId: string | null;
  uploadState: "pending" | "attached" | "orphaned";
  mimeType: string;
  widthPx: number;
  heightPx: number;
  mainSizeBytes: number;
  thumbnailSizeBytes: number;
  checksum: string;
  createdAt: string;
  expiresAt: string | null;
}

export async function uploadImage(
  file: File,
  clientSubmissionId: string,
  purpose: "listing" | "condition" | "profile" | "report" = "listing",
): Promise<{
  data: MediaMeta | null;
  error: { code: string; message: string } | null;
}> {
  const { getFirebaseAuth } = await import("@/lib/firebase-client");
  const auth = getFirebaseAuth();
  const user = auth.currentUser;

  if (!user) {
    return {
      data: null,
      error: { code: "UNAUTHORIZED", message: "Not signed in" },
    };
  }

  const token = await user.getIdToken();
  const formData = new FormData();
  formData.append("purpose", purpose);
  formData.append("file", file);

  try {
    // Use same-origin proxy to avoid CORS
    const res = await fetch(`/api/me/media`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-client-submission-id": clientSubmissionId,
      },
      body: formData,
    });

    const text = await res.text();
    const parsed = text ? JSON.parse(text) : null;

    if (!res.ok) {
      return {
        data: null,
        error: parsed?.error ?? { code: "UNKNOWN", message: "Upload failed" },
      };
    }

    return { data: parsed as MediaMeta, error: null };
  } catch {
    return {
      data: null,
      error: { code: "NETWORK_ERROR", message: "Could not reach server" },
    };
  }
}

export async function deleteMedia(mediaId: string): Promise<boolean> {
  const { getFirebaseAuth } = await import("@/lib/firebase-client");
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) return false;

  const token = await user.getIdToken();

  try {
    const res = await fetch(`/api/me/media/${mediaId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.status === 204;
  } catch {
    return false;
  }
}

/**
 * Get a private media URL for the owner's preview.
 * Uses the same-origin proxy to avoid CORS.
 */
export function getPrivateMediaUrl(
  mediaId: string,
  variant: "main" | "thumbnail" = "thumbnail",
): string {
  return `/api/me/media/${mediaId}?variant=${variant}`;
}

/**
 * Get a public media URL.
 * Uses the same-origin proxy to avoid CORS.
 */
export function getPublicMediaUrl(
  mediaId: string,
  variant: "main" | "thumbnail" = "thumbnail",
): string {
  return `/api/media/${mediaId}?variant=${variant}`;
}

// Seeded catalogue images are text-only development placeholders. Show the
// category illustration in the public UI until a real listing photo exists.
export function isDemoPlaceholderMedia(mediaId: string | null): boolean {
  return Boolean(mediaId?.startsWith("media_itm_"));
}

/**
 * Fetch private media as a blob and create an object URL.
 */
export async function fetchPrivateMediaUrl(
  mediaId: string,
  variant: "main" | "thumbnail" = "thumbnail",
): Promise<string | null> {
  const { getFirebaseAuth } = await import("@/lib/firebase-client");
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) return null;

  const token = await user.getIdToken();

  try {
    const res = await fetch(`/api/me/media/${mediaId}?variant=${variant}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;

    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/**
 * Fetch a private image (any same-origin /api path) with the member's token
 * and return an object URL. The caller revokes it when done.
 */
export async function fetchPrivateBlobUrl(apiPath: string): Promise<string | null> {
  const { getFirebaseAuth } = await import("@/lib/firebase-client");
  const user = getFirebaseAuth().currentUser;
  if (!user) return null;
  const token = await user.getIdToken();
  try {
    const res = await fetch(apiPath, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
}
