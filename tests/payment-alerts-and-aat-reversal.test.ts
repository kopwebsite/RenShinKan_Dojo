import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decideStudentPaymentAlerts } from "../shared/studentPaymentAlerts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (path: string) => readFileSync(resolve(root, path), "utf8");

function completeInputs() {
  return {
    isRenshinKan: true,
    currentMonth: "2026-07",
    monthly: {
      id: "monthly-current",
      month: "2026-07",
      expected: true,
      paymentStatus: "paid",
      proofStatus: "approved" as const,
    },
    aat: {
      id: "aat-current",
      membershipState: "current" as const,
      proofStatus: "approved" as const,
    },
    exams: [{
      id: "exam-paid",
      applicationStatus: "application_submitted",
      paymentStatus: "paid",
      lifecycleStatus: "open",
      applicationOpensAt: "2026-06-01T00:00:00.000Z",
      proofStatus: "approved" as const,
    }],
    nowIso: "2026-07-27T00:00:00.000Z",
  };
}

describe("student passport payment alerts", () => {
  it("raises each genuine current obligation and distinguishes a submitted proof", () => {
    const input = completeInputs();
    const alerts = decideStudentPaymentAlerts({
      ...input,
      monthly: { ...input.monthly, paymentStatus: "awaiting_payment", proofStatus: "pending_review" },
      aat: { ...input.aat, membershipState: "expired", proofStatus: null },
      exams: [{ ...input.exams[0], id: "exam-unpaid", paymentStatus: "payment_pending", proofStatus: null }],
    });
    expect(alerts).toEqual([
      { id: "monthly-current", type: "monthly_contribution", status: "under_review" },
      { id: "aat-current", type: "aat_membership", status: "action_required" },
      { id: "exam-unpaid", type: "examination_payment", status: "action_required" },
    ]);
  });

  it("does not alert for old or unexpected months, another dojo, future/draft/completed exams, or complete annual status", () => {
    const input = completeInputs();
    expect(decideStudentPaymentAlerts({
      ...input,
      isRenshinKan: false,
      monthly: { ...input.monthly, month: "2026-06", expected: false, paymentStatus: "awaiting_payment" },
      aat: { ...input.aat, membershipState: "expiring" },
      exams: [
        { ...input.exams[0], id: "future", paymentStatus: "payment_pending", applicationOpensAt: "2026-08-01T00:00:00.000Z" },
        { ...input.exams[0], id: "draft", paymentStatus: "payment_pending", lifecycleStatus: "draft" },
        { ...input.exams[0], id: "complete", paymentStatus: "payment_pending", applicationStatus: "examination_completed" },
      ],
    })).toEqual([]);
  });

  it("uses server decisions and localized, accessible actions in the owner passport", () => {
    const server = file("functions/_lib/studentRecords.ts");
    const ui = file("src/components/studentPassport/DigitalPassport.tsx");
    expect(server).toContain("decideStudentPaymentAlerts");
    expect(server).toContain("currentBangkokMonthKey()");
    expect(server).toContain("ec.lifecycle_status");
    expect(server).toContain("latestPaidAat");
    expect(ui).toContain("<PaymentAlerts");
    expect(ui).toContain("record.paymentAlerts");
    expect(ui).toContain("studentAlerts.actionRequired");
    expect(ui).toContain("ProofActions");
  });
});

describe("AAT paid-status reversal", () => {
  it("is additive, backfills the ledger, and prevents duplicate cancellation history", () => {
    const migration = file("migrations/0023_aat_payment_reversal_support.sql");
    expect(migration).toContain("INSERT OR IGNORE INTO payments");
    expect(migration).toContain("INSERT OR IGNORE INTO payment_history");
    expect(migration).toContain("idx_payment_history_one_cancellation");
    expect(migration).toContain("WHERE new_status = 'cancelled'");
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b/i);
  });

  it("requires same-origin authorization, exact student access, confirmation, and an auditable paid ledger entry", () => {
    const endpoint = file("functions/api/admin/memberships.ts");
    for (const value of [
      "isSameOriginRequest",
      "getAuthorizedAdminSession",
      "assertStudentAccess",
      'body.action === "mark_unpaid"',
      "body.confirmed !== true",
      "Only a payment currently marked paid can be reversed.",
      "aat_membership_paid_status_removed",
      "payment_history",
      "auditStatement",
    ]) expect(endpoint).toContain(value);
    expect(endpoint).toContain("UPDATE payments SET status = 'cancelled'");
    expect(endpoint).toContain("latestRemaining");
    expect(endpoint).not.toContain("DELETE FROM aat_membership_payments");
  });

  it("presents an identified confirmation dialog with an optional note and refreshes immediately", () => {
    const ui = file("src/components/admin/AdminAatMemberships.tsx");
    expect(ui).toContain("Mark as unpaid");
    expect(ui).toContain('role="alertdialog"');
    expect(ui).toContain("Payment ID");
    expect(ui).toContain("Reason or correction note (optional)");
    expect(ui).toContain("await load()");
    expect(ui).toContain("The original payment history was preserved.");
  });
});
