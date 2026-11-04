"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, X, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { uploadImage, deleteMedia, type MediaMeta } from "@/features/media/media-api";

const MAX_IMAGES = 3;

interface UploadedImage {
  mediaId: string;
  previewUrl: string;
  meta: MediaMeta;
}

interface ImageUploadProps {
  mediaIds: string[];
  onMediaIdsChange: (ids: string[]) => void;
  clientSubmissionPrefix: string;
  /** Called after a successful upload, e.g. to attach the image to its listing. */
  onUploaded?: (mediaId: string) => Promise<void> | void;
  /** Called before an image is removed, e.g. to detach it from its listing. */
  onRemoved?: (mediaId: string) => Promise<void> | void;
  /** "condition" uploads are private booking evidence, never public. */
  purpose?: "listing" | "condition" | "profile" | "report";
}

export function ImageUpload({
  mediaIds,
  onMediaIdsChange,
  clientSubmissionPrefix,
  onUploaded,
  onRemoved,
  purpose = "listing",
}: ImageUploadProps) {
  const [uploaded, setUploaded] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<string[]>([]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      for (const url of objectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  const canAddMore = uploaded.length < MAX_IMAGES;

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      if (!file) return;

      // Check type before upload
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setError("Only JPEG, PNG, and WebP images are accepted.");
        return;
      }

      // Check size (5 MiB max)
      if (file.size > 5 * 1024 * 1024) {
        setError("Image must be under 5 MB.");
        return;
      }

      setError(null);
      setUploading(true);

      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.push(previewUrl);

      const clientSubmissionId = `${clientSubmissionPrefix}-${Date.now()}`;
      const result = await uploadImage(file, clientSubmissionId, purpose);

      setUploading(false);

      if (result.data) {
        const newImage: UploadedImage = {
          mediaId: result.data.mediaId,
          previewUrl,
          meta: result.data,
        };
        setUploaded((prev) => [...prev, newImage]);
        onMediaIdsChange([...mediaIds, result.data.mediaId]);
        await onUploaded?.(result.data.mediaId);
      } else {
        URL.revokeObjectURL(previewUrl);
        objectUrlsRef.current = objectUrlsRef.current.filter((u) => u !== previewUrl);
        setError(result.error?.message ?? "Upload failed. Please try again.");
      }

      // Reset file input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [mediaIds, onMediaIdsChange, clientSubmissionPrefix, onUploaded, purpose],
  );

  const handleRemove = useCallback(
    async (index: number) => {
      const image = uploaded[index];
      if (!image) return;

      // Revoke the object URL
      URL.revokeObjectURL(image.previewUrl);
      objectUrlsRef.current = objectUrlsRef.current.filter((u) => u !== image.previewUrl);

      // Detach from the listing first (if attached), then delete the upload
      await onRemoved?.(image.mediaId);
      await deleteMedia(image.mediaId);

      // Update state
      const newUploaded = uploaded.filter((_, i) => i !== index);
      setUploaded(newUploaded);
      onMediaIdsChange(newUploaded.map((img) => img.mediaId));
    },
    [uploaded, onMediaIdsChange, onRemoved],
  );

  const handleMove = useCallback(
    (index: number, direction: "left" | "right") => {
      if (direction === "left" && index === 0) return;
      if (direction === "right" && index === uploaded.length - 1) return;

      const newUploaded = [...uploaded];
      const targetIndex = direction === "left" ? index - 1 : index + 1;
      [newUploaded[index], newUploaded[targetIndex]] = [newUploaded[targetIndex]!, newUploaded[index]!];
      setUploaded(newUploaded);
      onMediaIdsChange(newUploaded.map((img) => img.mediaId));
    },
    [uploaded, onMediaIdsChange],
  );

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {uploaded.map((image, index) => (
          <div
            key={image.mediaId}
            className="relative w-24 h-24 rounded-[var(--nsr-radius-lg)] border border-[var(--nsr-divider)] overflow-hidden group"
          >
            <img
              src={image.previewUrl}
              alt={`Image ${index + 1}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-[var(--nsr-transition-fast)] flex items-center justify-center opacity-0 group-hover:opacity-100">
              <button
                onClick={() => handleRemove(index)}
                className="p-1.5 rounded-full bg-white/90 text-[var(--nsr-error)] hover:bg-white focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nsr-focus)]"
                aria-label={`Remove image ${index + 1}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 py-0.5 bg-white/80">
              <button
                onClick={() => handleMove(index, "left")}
                disabled={index === 0}
                className="p-0.5 rounded text-[var(--nsr-text)] disabled:opacity-30 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--nsr-focus)]"
                aria-label={`Move image ${index + 1} left`}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[12px] text-[var(--nsr-text-secondary)]">
                {index + 1}
              </span>
              <button
                onClick={() => handleMove(index, "right")}
                disabled={index === uploaded.length - 1}
                className="p-0.5 rounded text-[var(--nsr-text)] disabled:opacity-30 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--nsr-focus)]"
                aria-label={`Move image ${index + 1} right`}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        {canAddMore && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={cn(
              "w-24 h-24 rounded-[var(--nsr-radius-lg)] border-2 border-dashed",
              "border-[var(--nsr-control-outline)]",
              "flex flex-col items-center justify-center gap-1",
              "text-[12px] text-[var(--nsr-text-secondary)]",
              "hover:border-[var(--nsr-primary)] hover:bg-[var(--nsr-selected-background)]",
              "transition-colors duration-[var(--nsr-transition-fast)]",
              "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nsr-focus)]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
            aria-label="Upload image"
          >
            {uploading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <>
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>Upload</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelect}
        aria-label="File upload"
      />

      {error && (
        <div className="mt-3 flex items-start gap-2 text-[13px] text-[var(--nsr-error)]">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-[var(--nsr-text-secondary)] hover:text-[var(--nsr-text)]"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <p className="mt-2 text-[13px] text-[var(--nsr-text-secondary)]">
        Up to {MAX_IMAGES} images. JPEG, PNG, or WebP. Max 5 MB each.
      </p>
    </div>
  );
}
