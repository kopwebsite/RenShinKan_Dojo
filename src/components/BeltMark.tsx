import { beltDescriptions, rankToBeltKey, type BeltKey } from "../utils/beltVisual";

type BeltMarkProps = {
  /** Rank string the belt is derived from, e.g. "10 Kyu" or "SHO Dan-Ho". */
  rank?: string | null;
  /** Explicit belt key when the caller already knows it (e.g. chart data). */
  beltKey?: BeltKey;
  /** Legacy stored colour used only when the rank cannot be parsed. */
  legacyColor?: string | null;
  /** Visual shape: a small inline chip, or the wider swatch used in charts. */
  variant?: "chip" | "swatch";
  className?: string;
  /** Hide from assistive tech when adjacent text already names the belt colour. */
  decorative?: boolean;
};

export function BeltMark({
  rank,
  beltKey,
  legacyColor,
  variant = "chip",
  className = "",
  decorative = false,
}: BeltMarkProps) {
  const key = beltKey ?? rankToBeltKey(rank, legacyColor);
  const label = beltDescriptions[key];

  return (
    <span
      className={`belt-mark belt-mark--${variant} belt-mark--${key} ${className}`.trim()}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      title={label}
    />
  );
}
