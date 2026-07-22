export type PublicExamination = {
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
  verified: true;
};

export type PassportAatContribution = {
  id: string;
  paymentDate: string;
  renewalDueDate: string | null;
  amount: number | null;
  currency: string;
  status: "paid" | "awaiting_payment" | "cancelled" | "refunded";
};

export type PassportMonthlyContribution = {
  id: string;
  month: string;
  status: "no_submission" | "awaiting_payment" | "paid";
  submittedAt: string | null;
  paidAt: string | null;
  updatedAt: string;
};

export type PassportChangeRequest = {
  id: string;
  type: "training_hours";
  title: string;
  previousValue: string;
  requestedValue: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  status: "approved" | "pending" | "denied";
};

export type PublicStudentRecord = {
  displayName: string; studentId: string; currentBelt: string; beltColor: string;
  totalVerifiedTrainingHours: number; examinations: PublicExamination[]; dojoName: string;
  lastUpdated: string | null; profileImage: string | null; verified: boolean;
};

export type StudentPassportRecord = PublicStudentRecord & {
  registrationDate: string | null;
  dojoId: string;
  dojoLogo: string | null;
  aatNumber: string | null;
  practiceDuration: string | null;
  profileBio: string | null;
  trainingEntries: PassportTrainingEntry[];
  aatContributions: PassportAatContribution[];
  monthlyContributions: PassportMonthlyContribution[] | null;
  changeRequests: PassportChangeRequest[];
};
