export const STUDENT_REQUEST_STATUSES = ["pending", "approved", "denied"] as const;

export type StudentRequestStatus = (typeof STUDENT_REQUEST_STATUSES)[number];

export const STUDENT_REQUEST_STATUS_LABELS: Record<StudentRequestStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  denied: "Denied",
};

export function studentRequestStatus(value: string): StudentRequestStatus {
  if (value === "approved" || value === "paid" || value === "examination_completed") return "approved";
  if (value === "rejected" || value === "denied" || value === "cancelled") return "denied";
  return "pending";
}
