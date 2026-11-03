/**
 * Bookings API client — availability, quotes, booking commands, arrangements
 * and condition records. All amounts come from the server.
 */

import { apiFetch } from "@/lib/api-client";
import type { OwnerListing } from "@/features/listings/listings-api";
import type {
  Arrangement,
  AvailabilityInfo,
  Booking,
  BookingDetail,
  BookingMode,
  BookingStatus,
  BookingSummary,
  ChecklistItem,
  ConditionReport,
  OverallCondition,
  OwnerBlock,
  OwnerCalendar,
  Quote,
} from "./bookings-types";

// ─── Owner calendar ───

export function fetchOwnerCalendar(listingId: string) {
  return apiFetch<OwnerCalendar>(`/me/listings/${listingId}/blocks`);
}

export function updateBookingSettings(
  listingId: string,
  body: {
    bookingMode: BookingMode;
    bookableFrom: string | null;
    bookableUntil: string | null;
    expectedRevision: number;
  },
) {
  return apiFetch<OwnerListing>(`/me/listings/${listingId}/booking-settings`, {
    method: "PATCH",
    body,
  });
}

export function addOwnerBlock(
  listingId: string,
  body: { startAt: string; endAt: string; note?: string; clientRequestId: string },
) {
  return apiFetch<OwnerBlock>(`/me/listings/${listingId}/blocks`, { method: "POST", body });
}

export function removeOwnerBlock(listingId: string, blockId: string) {
  return apiFetch<null>(`/me/listings/${listingId}/blocks/${blockId}`, { method: "DELETE" });
}

// ─── Public availability and quote ───

export function fetchAvailability(listingId: string) {
  return apiFetch<AvailabilityInfo>(`/listings/${listingId}/availability`, { auth: false });
}

/** Sends the token when signed in so the server can recognise the owner. */
export function fetchQuote(listingId: string, startAt: string, endAt: string) {
  return apiFetch<Quote>(`/listings/${listingId}/quote`, {
    method: "POST",
    body: { startAt, endAt },
  });
}

// ─── Bookings ───

export function createBooking(body: {
  listingId: string;
  startAt: string;
  endAt: string;
  quoteFingerprint: string;
  message?: string;
  clientRequestId: string;
  requestOfferId?: string;
}) {
  return apiFetch<Booking>("/me/bookings", { method: "POST", body });
}

export function fetchMyBookings(role: "borrower" | "owner", status?: BookingStatus) {
  const params = new URLSearchParams({ role });
  if (status) params.set("status", status);
  return apiFetch<{ items: BookingSummary[] }>(`/me/bookings?${params.toString()}`);
}

export function fetchBooking(id: string) {
  return apiFetch<BookingDetail>(`/me/bookings/${id}`);
}

type SimpleCommand = "accept" | "decline" | "confirm" | "report-return" | "confirm-receipt";

export function runBookingCommand(id: string, command: SimpleCommand, expectedRevision: number) {
  return apiFetch<Booking>(`/me/bookings/${id}/${command}`, {
    method: "POST",
    body: { expectedRevision },
  });
}

export function cancelBooking(id: string, expectedRevision: number, reason?: string) {
  return apiFetch<Booking>(`/me/bookings/${id}/cancel`, {
    method: "POST",
    body: { expectedRevision, reason: reason || undefined },
  });
}

export function reportIssue(id: string, expectedRevision: number, reason: string) {
  return apiFetch<Booking>(`/me/bookings/${id}/report-issue`, {
    method: "POST",
    body: { expectedRevision, reason },
  });
}

// ─── Arrangements ───

export function saveArrangement(
  id: string,
  kind: "pickup" | "return",
  body: {
    method: "pickup" | "meetup";
    agreedAt: string;
    locationText: string;
    instructions?: string;
    expectedArrangementRevision: number;
  },
) {
  return apiFetch<Arrangement>(`/me/bookings/${id}/arrangements/${kind}`, {
    method: "PUT",
    body,
  });
}

export function acknowledgeArrangement(id: string, kind: "pickup" | "return", arrangementRevision: number) {
  return apiFetch<Arrangement>(`/me/bookings/${id}/arrangements/${kind}/acknowledge`, {
    method: "POST",
    body: { arrangementRevision },
  });
}

// ─── Condition records ───

export function submitConditionReport(
  id: string,
  stage: "collection" | "return",
  body: {
    overallCondition: OverallCondition;
    checklist: ChecklistItem[];
    notes: string;
    mediaIds: string[];
    clientRequestId: string;
  },
) {
  return apiFetch<ConditionReport>(`/me/bookings/${id}/condition/${stage}`, {
    method: "POST",
    body,
  });
}

/** A correction becomes a new version; the earlier record stays readable. */
export function correctConditionReport(
  id: string,
  stage: "collection" | "return",
  body: {
    overallCondition: OverallCondition;
    checklist: ChecklistItem[];
    notes: string;
    mediaIds: string[];
    clientRequestId: string;
  },
) {
  return apiFetch<ConditionReport>(`/me/bookings/${id}/condition/${stage}/correct`, {
    method: "POST",
    body,
  });
}

export function acknowledgeCollection(
  id: string,
  body: { decision: "agreed" | "disagreed"; note?: string; expectedRevision: number },
) {
  return apiFetch<Booking>(`/me/bookings/${id}/condition/collection/acknowledge`, {
    method: "POST",
    body,
  });
}

/** Participant-only photo URL; fetch it with the bearer token (see fetchPrivateBlobUrl). */
export function conditionPhotoPath(bookingId: string, mediaId: string, variant: "main" | "thumbnail") {
  return `/api/me/bookings/${bookingId}/media/${mediaId}?variant=${variant}`;
}
