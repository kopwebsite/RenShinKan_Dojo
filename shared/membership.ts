export type AatMembershipState = "new" | "unpaid" | "current" | "expiring" | "expired";

function isoDate(value: string | null | undefined) {
  return isCanonicalDate(value) ? value : null;
}

export function addOneCalendarYear(value: string) {
  const parsed = isoDate(value);
  if (!parsed) return null;
  const [year, month, day] = parsed.split("-").map(Number);
  const next = new Date(Date.UTC(year + 1, month - 1, day));
  if (next.getUTCMonth() !== month - 1) next.setUTCDate(0);
  return next.toISOString().slice(0, 10);
}

export function aatMembershipStatus(aatNumber: string | null | undefined, lastPaidDate: string | null | undefined, today = new Date()) {
  const membershipNumber = typeof aatNumber === "string" && aatNumber.trim() ? aatNumber.trim() : null;
  const paid = isoDate(lastPaidDate);
  if (!paid) return { state: membershipNumber ? "unpaid" as const : "new" as const, label: "Payment required", dueDate: null, days: null };
  const dueDate = addOneCalendarYear(paid)!;
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const dueUtc = Date.parse(`${dueDate}T00:00:00Z`);
  const days = Math.ceil((dueUtc - todayUtc) / 86_400_000);
  if (days < 0) return { state: "expired" as const, label: "Expired", dueDate, days };
  if (days <= 45) return { state: "expiring" as const, label: "Renewal due soon", dueDate, days };
  return { state: "current" as const, label: "Paid and current", dueDate, days };
}
import { isCanonicalDate } from "./date";
