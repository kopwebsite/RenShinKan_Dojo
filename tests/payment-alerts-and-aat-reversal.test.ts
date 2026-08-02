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
      hasMembershipNumber: true,
      membershipState: "current" as const,
      proofStatus: "approved" as const,
    },
    examination: null as {
      id: string;
      attemptedRank: string;
      open: boolean;
      alreadyApplied: boolean;
    } | null,
  };
}

describe("student passport payment alerts", () => {
  it("raises only genuine current obligations that still need action", () => {
    const input = completeInputs();
    const alerts = decideStudentPaymentAlerts({
      ...input,
      monthly: {
        ...input.monthly,
        paymentStatus: "awaiting_payment",
        proofStatus: null,
      },
      aat: { ...input.aat, membershipState: "expired", proofStatus: null },
      examination: {
        id: "exam-open",
        attemptedRank: "4th Kyu",
        open: true,
        alreadyApplied: false,
      },
    });
    expect(alerts).toEqual([
      {
        id: "monthly-current",
        type: "monthly_missing",
        status: "action_required",
      },
      {
        id: "aat-current",
        type: "aat_contribution_due",
        status: "action_required",
      },
      {
        id: "exam-open",
        type: "examination_application",
        status: "action_required",
      },
    ]);
  });

  it("does not alert for old or unexpected months, another dojo, future/draft/completed exams, or complete annual status", () => {
    const input = completeInputs();
    expect(decideStudentPaymentAlerts({
      ...input,
      isRenshinKan: false,
      monthly: { ...input.monthly, month: "2026-06", expected: false, paymentStatus: "awaiting_payment" },
      aat: { ...input.aat, membershipState: "expiring" },
        examination: {
          id: "already-applied",
          attemptedRank: "4th Kyu",
          open: true,
          alreadyApplied: true,
        },
      }),
    ).toEqual([]);
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

  it("maps a shared AAT request proof to every covered student's payment without exposing the file", () => {
    const server = file("functions/_lib/studentRecords.ts");
    expect(server).toContain("LEFT JOIN payment_request_items pri ON pri.payment_reference_id = p.id");
    expect(server).toContain("COALESCE(pri.payment_request_id, p.id)");
    expect(server).toContain("proof_owner_student_id");
    expect(server.replace(/\s+/g, " ")).toContain("!entry.proof_owner_student_id || entry.proof_owner_student_id === student.id");
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
    expect(ui).toContain("Payment year");
    expect(ui).toContain("Payment ID");
    expect(ui).toContain("Reason or correction note (optional)");
    expect(ui).toContain("await load()");
    expect(ui).toContain("The original payment history was preserved.");
  });
});

describe("private route indexing protection", () => {
  it("adds an X-Robots-Tag header to admin, owner record, and shared record pages", () => {
    const helper = file("functions/_lib/privateResponse.ts");
    expect(helper).toContain('"X-Robots-Tag", "noindex, nofollow"');
    for (const path of ["functions/admin/[[path]].ts", "functions/student-records.ts", "functions/records/[[path]].ts"]) {
      expect(file(path)).toContain("withPrivateNoIndex");
    }
    expect(file("functions/admin/[[path]].ts")).toContain("withPrivateNoIndex(await next())");
  });
});
