import type { BookingStatus, ParticipantRole } from "./bookings-types";

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Awaiting owner",
  accepted: "Accepted, confirm to keep",
  confirmed: "Confirmed",
  active: "In use",
  overdue: "Overdue",
  return_pending: "Return reported",
  disputed: "Under review",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
};

export const STATUS_TONE: Record<BookingStatus, "success" | "warning" | "error" | "info" | "neutral"> = {
  pending: "warning",
  accepted: "warning",
  confirmed: "success",
  active: "info",
  overdue: "error",
  return_pending: "info",
  disputed: "error",
  completed: "success",
  declined: "neutral",
  cancelled: "neutral",
  expired: "neutral",
};

/** One-line explanation of what happens next, from the viewer's side. */
export function nextStepText(status: BookingStatus, role: ParticipantRole): string {
  const owner = role === "owner";
  switch (status) {
    case "pending":
      return owner ? "Accept or decline this request." : "Waiting for the owner to accept or decline.";
    case "accepted":
      return owner
        ? "Dates are held. Waiting for the borrower to confirm."
        : "Dates are held for you. Confirm with the simulated payment before the hold expires.";
    case "confirmed":
      return owner
        ? "Agree the pickup, then record the item's condition at collection."
        : "Agree the pickup. At collection, review the owner's condition record.";
    case "active":
      return owner ? "The item is with the borrower." : "Return the item on time and report the return.";
    case "overdue":
      return owner
        ? "The return time has passed. New bookings are paused until it is back."
        : "The return time has passed. Please return the item and report the return.";
    case "return_pending":
      return owner ? "Check the item and confirm receipt, or report an issue." : "Waiting for the owner to confirm receipt.";
    case "disputed":
      return "An issue was reported. An admin will look at the case; the deposit stays on hold until then.";
    case "completed":
      return "Exchange closed. You can review the other member for 14 days.";
    case "declined":
      return "The owner declined this request.";
    case "cancelled":
      return "This booking was cancelled.";
    case "expired":
      return "This request or hold expired. The dates are free again.";
  }
}

export const EVENT_LABELS: Record<string, string> = {
  requested: "Request sent",
  accepted: "Accepted by the owner",
  accepted_instantly: "Dates held (instant booking)",
  declined: "Declined",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  request_expired: "Request expired",
  hold_expired: "Hold expired",
  pickup_arrangement_proposed: "Pickup arrangement proposed",
  pickup_arrangement_acknowledged: "Pickup arrangement agreed",
  return_arrangement_proposed: "Return arrangement proposed",
  return_arrangement_acknowledged: "Return arrangement agreed",
  collection_condition_recorded: "Collection condition recorded",
  collection_disagreed: "Disagreement with the collection record",
  collected: "Collected; booking active",
  return_condition_recorded: "Return condition recorded",
  overdue: "Return overdue",
  return_reported: "Return reported",
  completed: "Receipt confirmed; completed",
  issue_reported: "Issue reported",
  review_left: "Review left",
  dispute_resolved: "Case resolved by an admin",
  complaint_opened: "Complaint opened after completion",
  collection_condition_corrected: "Collection record corrected (new version)",
  return_condition_corrected: "Return record corrected (new version)",
};
