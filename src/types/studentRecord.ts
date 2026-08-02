export type PublicExamination = {
  id?: string;
  examination_date: string; belt_awarded: string; belt_color: string; rank?: string | null; examiner?: string | null;
  public_notes?: string | null; passed?: number | null; rank_before?: string | null; rank_attempted?: string | null;
  rank_after?: string | null; examination_location?: string | null;
};

export type PassportTrainingEntry = {
  id: string;
  entryDate: string;
  periodEnd: string | null;
  hours: number;
  source: string;
  location: string | null;
  sourceType: "renshinkan" | "aat" | "other" | null;
  organization: string | null;
  sourceDetails: string | null;
  notes: string | null;
  verified: true;
};

export type PassportAatContribution = {
  id: string;
  paymentDate: string;
  renewalDueDate: string | null;
  amount: number | null;
  currency: string;
  status: "paid" | "awaiting_payment" | "cancelled" | "refunded";
  proof: PassportPaymentProof | null;
};

export type PassportMonthlyContribution = {
  id: string;
  month: string;
  status: "no_submission" | "awaiting_payment" | "paid";
  submittedAt: string | null;
  paidAt: string | null;
  updatedAt: string;
  expected: boolean;
  proof: PassportPaymentProof | null;
};

export type PassportPaymentProof = {
  id: string;
  status: "awaiting_upload" | "pending_review" | "approved" | "denied";
  submittedAt: string | null;
  reviewedAt: string | null;
  studentVisibleNote: string | null;
  fileAvailable: boolean;
  contentType: string | null;
  uploadToken: string | null;
};

export type PassportRequest = {
  id: string;
  type: "profile_information" | "training_hours" | "examination_application" | "aat_contribution" | "monthly_contribution" | "payslip";
  title: string;
  previousValue: string | null;
  requestedValue: string | null;
  submittedAt: string;
  decisionAt: string | null;
  studentVisibleNote: string | null;
  status: "approved" | "pending" | "denied";
  paymentStatus: string | null;
  documentStatus: string | null;
  period: string | null;
  explanation: string;
};

export type PassportAatSummary = {
  state: "up_to_date" | "due_soon" | "payment_record_missing" | "payslip_needed" | "submitted_for_review" | "verified";
  lastVerifiedPayment: string | null;
  nextDueDate: string | null;
};

export type PassportPaymentAlert = {
  id: string;
  type:
    | "monthly_missing"
    | "aat_number_missing"
    | "aat_contribution_due"
    | "examination_application";
  status: "action_required";
  period: string | null;
  attemptedRank: string | null;
  proof: PassportPaymentProof | null;
};

export type PublicStudentRecord = {
  displayName: string; englishName: string; thaiName: string | null; studentId: string; currentBelt: string; beltColor: string;
  totalVerifiedTrainingHours: number; examinations: PublicExamination[]; dojoName: string;
  lastUpdated: string | null; profileImage: string | null;
  profileStatus: "pending_admin_approval" | "approved"; verified: boolean;
};

export type StudentPassportRecord = PublicStudentRecord & {
  studentAccessToken?: string;
  registrationDate: string | null;
  accountCreatedDate: string | null;
  dojoJoinedDate: string | null;
  dojoId: string;
  dojoLogo: string | null;
  aatNumber: string | null;
  practiceDuration: string | null;
  trainingEntries: PassportTrainingEntry[];
  aatContributions: PassportAatContribution[];
  aatSummary: PassportAatSummary;
  monthlyContributions: PassportMonthlyContribution[] | null;
  paymentAlerts: PassportPaymentAlert[];
  requests: PassportRequest[];
};
