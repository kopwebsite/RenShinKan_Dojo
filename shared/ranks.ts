export const RANK_DEFINITIONS = [
  { value: "Unranked", beltKey: "white" },
  { value: "10 Kyu", beltKey: "orange" },
  { value: "9 Kyu", beltKey: "orange-blue" },
  { value: "8 Kyu", beltKey: "blue-orange" },
  { value: "7 Kyu", beltKey: "blue" },
  { value: "6 Kyu", beltKey: "blue-green" },
  { value: "5 Kyu", beltKey: "green" },
  { value: "4 Kyu", beltKey: "green-brown" },
  { value: "3 Kyu", beltKey: "brown" },
  { value: "2 Kyu", beltKey: "brown-black" },
  { value: "1 Kyu", beltKey: "black-brown" },
  { value: "SHO Dan-Ho", beltKey: "black" },
  { value: "1st Dan", beltKey: "black" },
  { value: "2nd Dan", beltKey: "black" },
  { value: "3rd Dan", beltKey: "black" },
] as const;

export type RankValue = (typeof RANK_DEFINITIONS)[number]["value"];
export type RankBeltKey = (typeof RANK_DEFINITIONS)[number]["beltKey"];

export const RANKS: readonly RankValue[] = RANK_DEFINITIONS.map((rank) => rank.value);

const RANK_INDEX = new Map<string, number>(
  RANK_DEFINITIONS.map((rank, index) => [rank.value.toLocaleLowerCase("en-US"), index]),
);

export function normalizeRank(value: unknown): RankValue | null {
  if (typeof value !== "string") return null;
  const index = RANK_INDEX.get(value.normalize("NFKC").trim().toLocaleLowerCase("en-US"));
  return index === undefined ? null : RANK_DEFINITIONS[index].value;
}

export function rankIndex(value: unknown) {
  const rank = normalizeRank(value);
  return rank ? RANK_DEFINITIONS.findIndex((item) => item.value === rank) : -1;
}

export function beltKeyForRank(value: unknown): RankBeltKey | null {
  const index = rankIndex(value);
  return index >= 0 ? RANK_DEFINITIONS[index].beltKey : null;
}

export function promoteRank(current: unknown, levels: unknown): RankValue | null {
  const currentIndex = rankIndex(current);
  const levelCount = Number(levels);
  if (currentIndex < 0 || !Number.isInteger(levelCount) || levelCount <= 0) return null;
  return RANK_DEFINITIONS[currentIndex + levelCount]?.value ?? null;
}

export function nextRank(current: unknown) {
  return promoteRank(current, 1);
}
