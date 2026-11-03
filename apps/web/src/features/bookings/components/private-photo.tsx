"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { fetchPrivateBlobUrl } from "@/features/media/media-api";

/** Condition photo readable only by the booking's participants. */
export function PrivatePhoto({ apiPath, alt }: { apiPath: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let created: string | null = null;
    fetchPrivateBlobUrl(apiPath).then((u) => {
      if (!active) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      created = u;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [apiPath]);

  return (
    <div className="h-24 w-24 overflow-hidden rounded-[var(--nsr-radius-md)] border border-[var(--nsr-divider)] bg-[var(--nsr-divider)]">
      {url ? (
        <img src={url} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-[var(--nsr-text-secondary)]">
          {failed ? <ImageOff size={18} aria-label="Photo unavailable" /> : null}
        </div>
      )}
    </div>
  );
}
