import { SimulatedTag } from "@/features/bookings/components/booking-status-badge";
import type { Deposit, Payment, TermsSnapshot } from "@/features/bookings/bookings-types";
import { formatDateTime, formatSar } from "@/lib/format";

const DEPOSIT_STATUS: Record<Deposit["status"], string> = {
  pending: "Pending",
  held: "Held",
  under_review: "Under review",
  settled: "Settled",
};

function paymentLabel(p: Payment): string {
  const what = p.component === "rental" ? "Rental fee" : "Deposit";
  return p.operation === "collect" ? `${what} paid` : `${what} refunded`;
}

/** Payments section; every figure is simulated and labelled as such. */
export function PaymentsPanel({
  terms,
  payments,
  deposit,
}: {
  terms: TermsSnapshot;
  payments: Payment[];
  deposit: Deposit | null;
}) {
  return (
    <section className="workspace-card" aria-labelledby="payments-heading">
      <div className="flex items-center gap-2 mb-2">
        <h2 id="payments-heading" className="!mb-0">
          Payments
        </h2>
        <SimulatedTag />
      </div>
      <p className="text-[13px] text-[var(--nsr-text-secondary)] mb-4">
        This is a demonstration. No real money moves, no card or bank details are collected, and these records are
        not bank transactions.
      </p>

      {payments.length === 0 ? (
        <p className="text-[14px] text-[var(--nsr-text-secondary)]">
          No simulated payments yet.{" "}
          {terms.totalHalalas > 0
            ? `${formatSar(terms.totalHalalas)} (rental ${formatSar(terms.rentalFeeHalalas)} + deposit ${formatSar(
                terms.depositHalalas,
              )}) is due at confirmation.`
            : "Nothing to pay for this booking."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {payments.map((p) => (
            <li key={p.id} className="term-line !my-1">
              <span>
                {paymentLabel(p)} · {formatDateTime(p.createdAt)}
              </span>
              <strong>
                {p.operation === "refund" ? "-" : ""}
                {formatSar(p.amountHalalas)}
              </strong>
            </li>
          ))}
        </ul>
      )}

      {deposit && (
        <div className="mt-4 rounded-[var(--nsr-radius-md)] bg-[var(--nsr-background)] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold">Refundable deposit</p>
            <span className="text-[12px] font-semibold">{DEPOSIT_STATUS[deposit.status]}</span>
          </div>
          <div className="term-line !my-1">
            <span>Required</span>
            <strong>{formatSar(deposit.requiredHalalas)}</strong>
          </div>
          <div className="term-line !my-1">
            <span>Held</span>
            <strong>{formatSar(deposit.heldHalalas)}</strong>
          </div>
          <div className="term-line !my-1">
            <span>Refunded</span>
            <strong>{formatSar(deposit.refundedHalalas)}</strong>
          </div>
        </div>
      )}
    </section>
  );
}
