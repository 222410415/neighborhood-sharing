"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarX, Trash2 } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/features/auth/auth-context";
import { fetchMyListing, type OwnerListing } from "@/features/listings/listings-api";
import {
  addOwnerBlock,
  fetchOwnerCalendar,
  removeOwnerBlock,
  updateBookingSettings,
} from "@/features/bookings/bookings-api";
import type { BookingMode, OwnerCalendar } from "@/features/bookings/bookings-types";
import { errorText } from "@/lib/api-client";
import {
  exclusiveEndToRiyadhDate,
  formatDateTime,
  isoToRiyadhDate,
  newClientId,
  riyadhDayEndIso,
  riyadhDayStartIso,
  riyadhLocalToIso,
} from "@/lib/format";

export default function ListingAvailabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [listing, setListing] = useState<OwnerListing | null>(null);
  const [calendar, setCalendar] = useState<OwnerCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [bookingMode, setBookingMode] = useState<BookingMode>("approval");
  const [firstDay, setFirstDay] = useState("");
  const [lastDay, setLastDay] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockNote, setBlockNote] = useState("");
  const [blockSaving, setBlockSaving] = useState(false);
  const [blockMessage, setBlockMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/sign-in?return=/listings/${id}/availability`);
    }
  }, [authLoading, user, router, id]);

  const load = useCallback(async () => {
    const [listingRes, calendarRes] = await Promise.all([fetchMyListing(id), fetchOwnerCalendar(id)]);
    setLoading(false);
    if (!listingRes.data || !calendarRes.data) {
      setLoadError(errorText(listingRes.error ?? calendarRes.error, "This listing could not be loaded."));
      return;
    }
    setLoadError(null);
    setListing(listingRes.data);
    setCalendar(calendarRes.data);
    setBookingMode(calendarRes.data.bookingMode);
    setFirstDay(calendarRes.data.bookableFrom ? isoToRiyadhDate(calendarRes.data.bookableFrom) : "");
    setLastDay(calendarRes.data.bookableUntil ? exclusiveEndToRiyadhDate(calendarRes.data.bookableUntil) : "");
  }, [id]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const handleSaveSettings = async () => {
    if (!listing) return;
    setSettingsMessage(null);
    if ((firstDay && !lastDay) || (!firstDay && lastDay)) {
      setSettingsMessage({ kind: "error", text: "Choose both the first and the last bookable day, or neither." });
      return;
    }
    setSettingsSaving(true);
    const res = await updateBookingSettings(id, {
      bookingMode,
      bookableFrom: firstDay ? riyadhDayStartIso(firstDay) : null,
      bookableUntil: lastDay ? riyadhDayEndIso(lastDay) : null,
      expectedRevision: listing.revision,
    });
    setSettingsSaving(false);
    if (res.data) {
      setListing(res.data);
      setSettingsMessage({ kind: "success", text: "Booking settings saved." });
      await load();
    } else if (res.status === 409) {
      setSettingsMessage({
        kind: "error",
        text: "This listing changed in another window. The latest version has been loaded; review and save again.",
      });
      await load();
    } else {
      setSettingsMessage({ kind: "error", text: errorText(res.error, "Settings could not be saved.") });
    }
  };

  const handleAddBlock = async () => {
    setBlockMessage(null);
    if (!blockStart || !blockEnd) {
      setBlockMessage({ kind: "error", text: "Choose when the period starts and ends." });
      return;
    }
    setBlockSaving(true);
    const res = await addOwnerBlock(id, {
      startAt: riyadhLocalToIso(blockStart),
      endAt: riyadhLocalToIso(blockEnd),
      note: blockNote.trim() || undefined,
      clientRequestId: newClientId("block"),
    });
    setBlockSaving(false);
    if (res.data) {
      setBlockStart("");
      setBlockEnd("");
      setBlockNote("");
      setBlockMessage({ kind: "success", text: "Unavailable period added." });
      await load();
    } else {
      setBlockMessage({ kind: "error", text: errorText(res.error, "The period could not be added.") });
    }
  };

  const handleRemoveBlock = async (blockId: string) => {
    setBlockMessage(null);
    const res = await removeOwnerBlock(id, blockId);
    if (res.error) {
      setBlockMessage({ kind: "error", text: errorText(res.error, "The period could not be removed.") });
    }
    await load();
  };

  if (authLoading || (loading && !loadError)) {
    return (
      <ContentContainer>
        <div className="max-w-3xl mx-auto py-8 flex flex-col gap-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </ContentContainer>
    );
  }

  if (!user) return null;

  if (loadError || !listing || !calendar) {
    return (
      <ContentContainer>
        <div className="max-w-3xl mx-auto py-8">
          <Alert variant="error">{loadError ?? "This listing could not be loaded."}</Alert>
        </div>
      </ContentContainer>
    );
  }

  const isArchived = listing.status === "archived";

  return (
    <ContentContainer>
      <div className="max-w-3xl mx-auto">
        <Link href="/my-listings" className="back-link">
          <ArrowLeft size={15} /> Back to my listings
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <PageHeading
            title="Availability"
            subtitle={`Choose how and when neighbors can book ${listing.titleEn}.`}
          />
          <StatusBadge status={listing.status} />
        </div>

        {listing.status !== "published" && !isArchived && (
          <div className="mb-4">
            <Alert variant="info">
              Neighbors can only request this item while it is published. You can prepare the settings now.
            </Alert>
          </div>
        )}
        {calendar.itemOnHold && (
          <div className="mb-4">
            <Alert variant="warning" title="New bookings are paused">
              A current exchange is overdue, waiting for your receipt or under review. New bookings resume once it is
              closed.
            </Alert>
          </div>
        )}

        <section className="form-section">
          <h2>Booking settings</h2>
          <p>Booking is off until you choose the days neighbors can book.</p>
          <div className="choice-row flex-wrap">
            <label className="choice-card">
              <input
                type="radio"
                name="bookingMode"
                value="approval"
                checked={bookingMode === "approval"}
                disabled={isArchived}
                onChange={() => setBookingMode("approval")}
              />
              <span>
                <strong className="block">Review each request</strong>
                <span className="text-[12px] text-[var(--nsr-text-secondary)]">You accept or decline every request.</span>
              </span>
            </label>
            <label className="choice-card">
              <input
                type="radio"
                name="bookingMode"
                value="instant"
                checked={bookingMode === "instant"}
                disabled={isArchived}
                onChange={() => setBookingMode("instant")}
              />
              <span>
                <strong className="block">Instant booking</strong>
                <span className="text-[12px] text-[var(--nsr-text-secondary)]">Free dates are held as soon as someone books.</span>
              </span>
            </label>
          </div>
          <div className="form-grid">
            <Field
              label="First bookable day"
              name="bookableFirstDay"
              type="date"
              value={firstDay}
              disabled={isArchived}
              onChange={(e) => setFirstDay(e.target.value)}
            />
            <Field
              label="Last bookable day"
              name="bookableLastDay"
              type="date"
              value={lastDay}
              disabled={isArchived}
              onChange={(e) => setLastDay(e.target.value)}
            />
          </div>
          <p className="mt-3 text-[13px] text-[var(--nsr-text-secondary)]">
            Times are Riyadh time. Pickup can be at most 90 days ahead, and one booking can last up to 14 days
            (draft limits pending team approval).
          </p>
          {settingsMessage && (
            <div className="mt-4">
              <Alert variant={settingsMessage.kind}>{settingsMessage.text}</Alert>
            </div>
          )}
          {!isArchived && (
            <div className="mt-5 flex flex-wrap gap-3 justify-end">
              {(firstDay || lastDay) && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFirstDay("");
                    setLastDay("");
                  }}
                >
                  Turn booking off
                </Button>
              )}
              <Button loading={settingsSaving} onClick={handleSaveSettings}>
                Save settings
              </Button>
            </div>
          )}
        </section>

        <section className="form-section">
          <h2>Unavailable periods</h2>
          <p>Block times when the item cannot be lent. Neighbors only see that the dates are busy, not why.</p>
          {calendar.ownerBlocks.length === 0 ? (
            <p className="text-[14px] text-[var(--nsr-text-secondary)]">No unavailable periods.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {calendar.ownerBlocks.map((block) => (
                <li
                  key={block.id}
                  className="flex items-center gap-3 rounded-[var(--nsr-radius-md)] border border-[var(--nsr-divider)] px-4 py-3"
                >
                  <CalendarX size={18} className="shrink-0 text-[var(--nsr-text-secondary)]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium">
                      {formatDateTime(block.startAt)} to {formatDateTime(block.endAt)}
                    </p>
                    {block.note && (
                      <p className="text-[12px] text-[var(--nsr-text-secondary)]">Private note: {block.note}</p>
                    )}
                  </div>
                  {!isArchived && (
                    <button
                      type="button"
                      onClick={() => handleRemoveBlock(block.id)}
                      className="p-2 rounded-[var(--nsr-radius-sm)] text-[var(--nsr-error)] hover:bg-[var(--nsr-error-background)]"
                      aria-label={`Remove unavailable period starting ${formatDateTime(block.startAt)}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!isArchived && (
            <div className="mt-5 border-t border-[var(--nsr-divider)] pt-5">
              <h3 className="text-[15px] font-semibold mb-3">Add an unavailable period</h3>
              <div className="form-grid">
                <Field
                  label="From"
                  name="blockStart"
                  type="datetime-local"
                  value={blockStart}
                  onChange={(e) => setBlockStart(e.target.value)}
                />
                <Field
                  label="Until"
                  name="blockEnd"
                  type="datetime-local"
                  value={blockEnd}
                  onChange={(e) => setBlockEnd(e.target.value)}
                />
                <div className="form-span">
                  <Field
                    label="Private note (optional, only you see it)"
                    name="blockNote"
                    value={blockNote}
                    onChange={(e) => setBlockNote(e.target.value)}
                  />
                </div>
              </div>
              {blockMessage && (
                <div className="mt-4">
                  <Alert variant={blockMessage.kind}>{blockMessage.text}</Alert>
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <Button variant="secondary" loading={blockSaving} onClick={handleAddBlock}>
                  Add period
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="form-section">
          <h2>Reserved periods</h2>
          <p>Dates held by accepted or confirmed bookings. They change only through the booking.</p>
          {calendar.reservations.length === 0 ? (
            <p className="text-[14px] text-[var(--nsr-text-secondary)]">No reservations.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {calendar.reservations.map((block) => (
                <li
                  key={block.id}
                  className="flex items-center gap-3 rounded-[var(--nsr-radius-md)] border border-[var(--nsr-divider)] px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium">
                      {formatDateTime(block.startAt)} to {formatDateTime(block.endAt)}
                    </p>
                    {block.holdExpiresAt && (
                      <p className="text-[12px] text-[var(--nsr-text-secondary)]">
                        Held until {formatDateTime(block.holdExpiresAt)} unless confirmed
                      </p>
                    )}
                  </div>
                  {block.bookingId && (
                    <Link
                      href={`/bookings/${block.bookingId}`}
                      className="text-[13px] font-semibold text-[var(--nsr-link)]"
                    >
                      View booking
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ContentContainer>
  );
}
