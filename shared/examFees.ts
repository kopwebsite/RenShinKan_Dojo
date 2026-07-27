import { normalizeRank, type RankValue } from "./ranks";

export const EXAM_APPLICATION_RANKS: readonly RankValue[] = [
  "10 Kyu", "9 Kyu", "8 Kyu", "7 Kyu", "6 Kyu",
  "5 Kyu", "4 Kyu", "3 Kyu", "2 Kyu", "1 Kyu",
  "SHO Dan-Ho", "1st Dan",
];

export function examinationFeeThb(value: unknown) {
  const rank = normalizeRank(value);
  if (!rank || !EXAM_APPLICATION_RANKS.includes(rank)) return null;
  if (["10 Kyu", "9 Kyu", "8 Kyu", "7 Kyu", "6 Kyu"].includes(rank)) return 800;
  if (rank === "5 Kyu" || rank === "4 Kyu") return 1100;
  if (rank === "3 Kyu" || rank === "2 Kyu" || rank === "1 Kyu") return 1400;
  if (rank === "SHO Dan-Ho") return 2100;
  return 2600;
}

export function formatThb(amount: number) {
  return `THB ${amount.toLocaleString("en-US")}`;
}
