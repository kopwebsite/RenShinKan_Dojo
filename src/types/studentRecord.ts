export type PublicExamination = {
  examination_date: string; belt_awarded: string; belt_color: string; rank?: string | null; examiner?: string | null;
  public_notes?: string | null; passed?: number | null; rank_before?: string | null; rank_attempted?: string | null;
  rank_after?: string | null; examination_location?: string | null;
};
export type PublicStudentRecord = {
  displayName: string; studentId: string; currentBelt: string; beltColor: string;
  totalVerifiedTrainingHours: number; examinations: PublicExamination[]; dojoName: string;
  lastUpdated: string | null; profileImage: string | null; verified: boolean;
};
