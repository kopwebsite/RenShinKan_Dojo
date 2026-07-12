/**
 * RenShinKan kyu-belt visual system.
 *
 * Every belt visual on the site is derived from the student's rank string via
 * rankToBeltKey, so ranks and colours can never drift apart. Split belts use
 * hard colour stops (no blended gradients) with the senior colour always on
 * the left, in the exact proportions used by the dojo:
 *
 *   10th kyu  orange
 *    9th kyu  2/3 orange + 1/3 blue
 *    8th kyu  2/3 blue + 1/3 orange
 *    7th kyu  blue
 *    6th kyu  1/2 blue + 1/2 green
 *    5th kyu  green
 *    4th kyu  1/2 green + 1/2 brown
 *    3rd kyu  brown
 *    2nd kyu  2/3 brown + 1/3 black
 *    1st kyu  2/3 black + 1/3 brown
 *    Sho/dan  black
 */

export type BeltKey =
  | "orange"
  | "orange-blue"
  | "blue-orange"
  | "blue"
  | "blue-green"
  | "green"
  | "green-brown"
  | "brown"
  | "brown-black"
  | "black-brown"
  | "black"
  | "white";

const KYU_TO_BELT: Record<number, BeltKey> = {
  10: "orange",
  9: "orange-blue",
  8: "blue-orange",
  7: "blue",
  6: "blue-green",
  5: "green",
  4: "green-brown",
  3: "brown",
  2: "brown-black",
  1: "black-brown",
};

/** Plain-language colour description so meaning never relies on colour alone. */
export const beltDescriptions: Record<BeltKey, string> = {
  orange: "orange belt",
  "orange-blue": "orange belt with a blue band (two-thirds orange, one-third blue)",
  "blue-orange": "blue belt with an orange band (two-thirds blue, one-third orange)",
  blue: "blue belt",
  "blue-green": "half blue, half green belt",
  green: "green belt",
  "green-brown": "half green, half brown belt",
  brown: "brown belt",
  "brown-black": "brown belt with a black band (two-thirds brown, one-third black)",
  "black-brown": "black belt with a brown band (two-thirds black, one-third brown)",
  black: "black belt",
  white: "white belt",
};

/** Short visible colour names for legends and chart rows. */
export const beltShortNames: Record<BeltKey, string> = {
  orange: "Orange",
  "orange-blue": "Orange · blue",
  "blue-orange": "Blue · orange",
  blue: "Blue",
  "blue-green": "Blue · green",
  green: "Green",
  "green-brown": "Green · brown",
  brown: "Brown",
  "brown-black": "Brown · black",
  "black-brown": "Black · brown",
  black: "Black",
  white: "White",
};

/**
 * Legacy stored colour values (from the student database) mapped onto the
 * current belt keys. Used only as a fallback when a rank string cannot be
 * parsed, so no destructive data migration is required.
 */
const LEGACY_COLOR_TO_BELT: Record<string, BeltKey> = {
  white: "white",
  orange: "orange",
  blue: "blue",
  green: "green",
  brown: "brown",
  black: "black",
  "white-stripe": "white",
  "blue-stripe": "blue-green",
  "green-stripe": "green-brown",
  "brown-stripe": "brown-black",
  "brown-double": "black-brown",
};

/**
 * Derive the belt visual from a rank string such as "10 Kyu", "3rd kyu",
 * "SHO Dan-Ho" or "2nd Dan". Falls back to a stored legacy colour, then to
 * the white beginner belt, so old records keep rendering.
 */
export function rankToBeltKey(rank: string | null | undefined, legacyColor?: string | null): BeltKey {
  const normalized = (rank ?? "").toLocaleLowerCase("en-US").trim();

  if (normalized) {
    if (normalized.includes("dan") || normalized.includes("sho")) {
      return "black";
    }

    const kyuMatch = normalized.match(/\b(10|[1-9])\s*(?:st|nd|rd|th)?\s*ky[uū]\b/);
    if (kyuMatch) {
      const belt = KYU_TO_BELT[Number(kyuMatch[1])];
      if (belt) {
        return belt;
      }
    }

    if (normalized.includes("unranked") || normalized.includes("beginner")) {
      return "white";
    }
  }

  const legacy = (legacyColor ?? "").toLocaleLowerCase("en-US").trim();
  if (legacy && LEGACY_COLOR_TO_BELT[legacy]) {
    return LEGACY_COLOR_TO_BELT[legacy];
  }

  return "white";
}
