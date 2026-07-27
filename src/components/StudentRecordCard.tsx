import type { PublicStudentRecord, StudentPassportRecord } from "../types/studentRecord";
import { DigitalPassport } from "./studentPassport/DigitalPassport";

export function StudentRecordCard({ record, onRecordChange }: {
  record: PublicStudentRecord | StudentPassportRecord;
  onRecordChange?: (record: StudentPassportRecord) => void;
}) {
  return <DigitalPassport record={record} onRecordChange={onRecordChange} />;
}
