export type PaymentAlertDecision = {
  id: string;
  type:
    | "monthly_missing"
    | "aat_number_missing"
    | "aat_contribution_due"
    | "examination_application";
  status: "action_required";
};

type ProofStatus =
  "awaiting_upload" | "pending_review" | "approved" | "denied" | null;

type AlertInputs = {
  isRenshinKan: boolean;
  currentMonth: string;
  monthly: {
    id: string;
    month: string;
    expected: boolean;
    paymentStatus: string;
    proofStatus: ProofStatus;
  } | null;
  aat: {
    id: string;
    hasMembershipNumber: boolean;
    membershipState: "new" | "unpaid" | "current" | "expiring" | "expired";
    proofStatus: ProofStatus;
  };
  examination: {
    id: string;
    attemptedRank: string;
    open: boolean;
    alreadyApplied: boolean;
  } | null;
};

function needsAction(proofStatus: ProofStatus) {
  return proofStatus !== "pending_review" && proofStatus !== "approved";
}

export function decideStudentPaymentAlerts(
  input: AlertInputs,
): PaymentAlertDecision[] {
  const alerts: PaymentAlertDecision[] = [];
  if (
    input.isRenshinKan
    && input.monthly?.month === input.currentMonth
    && input.monthly.expected &&
    input.monthly.paymentStatus !== "paid" &&
    needsAction(input.monthly.proofStatus)
  ) {
    alerts.push({
      id: input.monthly.id,
      type: "monthly_missing",
      status: "action_required",
    });
  }
  if (!input.aat.hasMembershipNumber) {
    alerts.push({
      id: input.aat.id,
      type: "aat_number_missing",
      status: "action_required",
    });
  } else if (
    input.aat.membershipState !== "current" &&
    input.aat.membershipState !== "expiring" &&
    needsAction(input.aat.proofStatus)
  ) {
    alerts.push({
      id: input.aat.id,
      type: "aat_contribution_due",
      status: "action_required",
    });
  }
  if (input.examination?.open && !input.examination.alreadyApplied) {
    alerts.push({
      id: input.examination.id,
      type: "examination_application",
      status: "action_required",
    });
  }
  return alerts;
}
