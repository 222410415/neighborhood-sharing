import { CheckCircle2, XCircle } from "lucide-react";
import { PrivatePhoto } from "@/features/bookings/components/private-photo";
import { conditionPhotoPath } from "@/features/bookings/bookings-api";
import type { ConditionReport } from "@/features/bookings/bookings-types";
import { formatDateTime } from "@/lib/format";

/** Read-only view of a submitted condition record and its acknowledgement. */
export function ConditionSummary({
  bookingId,
  report,
  submitterName,
  acknowledgerName,
  photoPath,
}: {
  bookingId: string;
  report: ConditionReport;
  submitterName: string;
  acknowledgerName?: string;
  /** Override the photo route (the admin workspace uses its own audited route). */
  photoPath?: (mediaId: string, variant: "main" | "thumbnail") => string;
}) {
  return (
    <div className="flex flex-col gap-3 text-[14px]">
      <p>
        <strong className="capitalize">{report.overallCondition}</strong> overall · recorded by {submitterName} on{" "}
        {formatDateTime(report.submittedAt)}
      </p>
      {report.checklist.length > 0 && (
        <ul className="flex flex-col gap-1">
          {report.checklist.map((item) => (
            <li key={item.label} className="flex items-start gap-2">
              {item.ok ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--nsr-success)]" aria-label="OK" />
              ) : (
                <XCircle size={16} className="mt-0.5 shrink-0 text-[var(--nsr-error)]" aria-label="Problem" />
              )}
              <span>
                {item.label}
                {item.note && <span className="text-[var(--nsr-text-secondary)]">: {item.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {report.notes && <p className="text-[var(--nsr-text-secondary)] whitespace-pre-wrap">{report.notes}</p>}
      {report.mediaIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {report.mediaIds.map((mediaId, i) => (
            <PrivatePhoto
              key={mediaId}
              apiPath={photoPath ? photoPath(mediaId, "thumbnail") : conditionPhotoPath(bookingId, mediaId, "thumbnail")}
              alt={`${report.stage} condition photo ${i + 1}`}
            />
          ))}
        </div>
      )}
      {report.acknowledgement && (
        <p
          className={
            report.acknowledgement.decision === "agreed"
              ? "text-[var(--nsr-success)] text-[13px] font-semibold"
              : "text-[var(--nsr-error)] text-[13px] font-semibold"
          }
        >
          {report.acknowledgement.decision === "agreed" ? "Agreed" : "Disagreement recorded"} by{" "}
          {acknowledgerName ?? "the other member"} on {formatDateTime(report.acknowledgement.at)}
          {report.acknowledgement.note ? `: ${report.acknowledgement.note}` : ""}
        </p>
      )}
    </div>
  );
}
