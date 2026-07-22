import type { PublicStudentRecord, StudentPassportRecord } from "../types/studentRecord";
import { DigitalPassport } from "./studentPassport/DigitalPassport";

export function StudentRecordCard({ record }: { record: PublicStudentRecord | StudentPassportRecord }) {
  return <DigitalPassport record={record} />;
}
