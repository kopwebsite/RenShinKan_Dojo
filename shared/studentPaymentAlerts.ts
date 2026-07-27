export type PaymentAlertDecision = {
  id: string;
  type: "monthly_contribution" | "aat_membership" | "examination_payment";
  status: "action_required" | "under_review";
};

type ProofStatus = "awaiting_upload" | "pending_review" | "approved" | "denied" | null;

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
    membershipState: "new" | "unpaid" | "current" | "expiring" | "expired";
    proofStatus: ProofStatus;
  };
  exams: Array<{
    id: string;
    applicationStatus: string;
    paymentStatus: string;
    lifecycleStatus: string;
    applicationOpensAt: string | null;
    proofStatus: ProofStatus;
  }>;
  nowIso: string;
};

function reviewStatus(proofStatus: ProofStatus) {
  return proofStatus === "pending_review" || proofStatus === "approved" ? "under_review" as const : "action_required" as const;
}

export function decideStudentPaymentAlerts(input: AlertInputs): PaymentAlertDecision[] {
  const alerts: PaymentAlertDecision[] = [];
  if (
    input.isRenshinKan
    && input.monthly?.month === input.currentMonth
    && input.monthly.expected
    && input.monthly.paymentStatus !== "paid"
  ) {
    alerts.push({
      id: input.monthly.id,
      type: "monthly_contribution",
      status: reviewStatus(input.monthly.proofStatus),
    });
  }
  if (input.aat.membershipState !== "current" && input.aat.membershipState !== "expiring") {
    alerts.push({
      id: input.aat.id,
      type: "aat_membership",
      status: reviewStatus(input.aat.proofStatus),
    });
  }
  for (const exam of input.exams) {
    const opened = !exam.applicationOpensAt || exam.applicationOpensAt <= input.nowIso;
    if (
      exam.applicationStatus === "application_submitted"
      && exam.paymentStatus !== "paid"
      && (exam.lifecycleStatus === "open" || exam.lifecycleStatus === "closed")
      && opened
    ) {
      alerts.push({
        id: exam.id,
        type: "examination_payment",
        status: reviewStatus(exam.proofStatus),
      });
    }
  }
  return alerts;
}
