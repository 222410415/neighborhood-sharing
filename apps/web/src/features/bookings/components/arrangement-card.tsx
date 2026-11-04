"use client";

import { useState } from "react";
import { CheckCircle2, MapPin } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { acknowledgeArrangement, saveArrangement } from "@/features/bookings/bookings-api";
import type { Arrangement } from "@/features/bookings/bookings-types";
import { errorText } from "@/lib/api-client";
import { formatDateTime, isoToRiyadhLocal, riyadhLocalToIso } from "@/lib/format";

interface ArrangementCardProps {
  bookingId: string;
  kind: "pickup" | "return";
  arrangement: Arrangement | null;
  /** The viewer may propose or acknowledge in the current booking state. */
  canEdit: boolean;
  viewerUid: string;
  otherName: string;
  defaultTime: string;
  onChanged: () => void;
}

export function ArrangementCard({
  bookingId,
  kind,
  arrangement,
  canEdit,
  viewerUid,
  otherName,
  defaultTime,
  onChanged,
}: ArrangementCardProps) {
  const label = kind === "pickup" ? "Pickup" : "Return";
  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState<"pickup" | "meetup">(arrangement?.method ?? "pickup");
  const [when, setWhen] = useState(isoToRiyadhLocal(arrangement?.agreedAt ?? defaultTime));
  const [place, setPlace] = useState(arrangement?.locationText ?? "");
  const [instructions, setInstructions] = useState(arrangement?.instructions ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!when || !place.trim()) {
      setError("Choose a time and describe the place.");
      return;
    }
    setBusy(true);
    const res = await saveArrangement(bookingId, kind, {
      method,
      agreedAt: riyadhLocalToIso(when),
      locationText: place.trim(),
      instructions: instructions.trim() || undefined,
      expectedArrangementRevision: arrangement?.revision ?? 0,
    });
    setBusy(false);
    if (res.data) {
      setEditing(false);
      onChanged();
    } else {
      setError(errorText(res.error, "The arrangement could not be saved."));
      if (res.status === 409) onChanged();
    }
  };

  const acknowledge = async () => {
    if (!arrangement) return;
    setError(null);
    setBusy(true);
    const res = await acknowledgeArrangement(bookingId, kind, arrangement.revision);
    setBusy(false);
    if (res.data) onChanged();
    else {
      setError(errorText(res.error, "The arrangement could not be acknowledged."));
      if (res.status === 409) onChanged();
    }
  };

  const startEditing = () => {
    setMethod(arrangement?.method ?? "pickup");
    setWhen(isoToRiyadhLocal(arrangement?.agreedAt ?? defaultTime));
    setPlace(arrangement?.locationText ?? "");
    setInstructions(arrangement?.instructions ?? "");
    setError(null);
    setEditing(true);
  };

  const proposedByMe = arrangement?.proposedByUid === viewerUid;
  const needsMyAck = !!arrangement && !arrangement.acknowledgedByUid && !proposedByMe;

  return (
    <div className="rounded-[var(--nsr-radius-md)] border border-[var(--nsr-divider)] p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-[15px] font-semibold">{label} arrangement</h3>
        {arrangement &&
          (arrangement.acknowledgedByUid ? (
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--nsr-success)]">
              <CheckCircle2 size={14} /> Agreed by both
            </span>
          ) : (
            <span className="text-[12px] font-semibold text-[var(--nsr-warning)]">
              {proposedByMe ? `Waiting for ${otherName}` : "Needs your acknowledgement"}
            </span>
          ))}
      </div>

      {arrangement && !editing && (
        <div className="text-[14px]">
          <p>
            <strong>{arrangement.method === "pickup" ? "Pickup at the owner's place" : "Meet up"}</strong> on{" "}
            {formatDateTime(arrangement.agreedAt)}
          </p>
          <p className="flex items-start gap-1 text-[var(--nsr-text-secondary)]">
            <MapPin size={14} className="mt-1 shrink-0" /> {arrangement.locationText}
          </p>
          {arrangement.instructions && (
            <p className="text-[13px] text-[var(--nsr-text-secondary)]">{arrangement.instructions}</p>
          )}
          <p className="mt-1 text-[12px] text-[var(--nsr-text-secondary)]">
            Version {arrangement.revision}, proposed by {proposedByMe ? "you" : otherName}. Private to the two of you.
          </p>
        </div>
      )}
      {!arrangement && !editing && (
        <p className="text-[13px] text-[var(--nsr-text-secondary)]">
          {canEdit ? `No ${label.toLowerCase()} arrangement yet.` : "Not arranged."}
        </p>
      )}

      {editing && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 flex-wrap">
            <label className="choice-card !py-2">
              <input type="radio" checked={method === "pickup"} onChange={() => setMethod("pickup")} />
              <span>At the owner&apos;s place</span>
            </label>
            <label className="choice-card !py-2">
              <input type="radio" checked={method === "meetup"} onChange={() => setMethod("meetup")} />
              <span>Meet up</span>
            </label>
          </div>
          <label className="booking-field">
            <span>Time (Riyadh)</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <label className="booking-field">
            <span>Place</span>
            <input
              value={place}
              maxLength={300}
              placeholder="For example: Building 12 entrance, Al Nuzhah"
              onChange={(e) => setPlace(e.target.value)}
            />
          </label>
          <label className="booking-field">
            <span>Instructions (optional)</span>
            <textarea rows={2} maxLength={500} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </label>
        </div>
      )}

      {error && (
        <div className="mt-3">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button size="sm" loading={busy} onClick={save}>
                Save {label.toLowerCase()} arrangement
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              {needsMyAck && (
                <Button size="sm" loading={busy} onClick={acknowledge}>
                  Acknowledge
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={startEditing}>
                {arrangement ? "Propose a change" : `Propose ${label.toLowerCase()} details`}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
