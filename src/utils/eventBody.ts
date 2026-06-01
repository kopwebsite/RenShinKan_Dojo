import type { BodyMediaAlign, BodyMediaPlacement } from "../types/editableContent";

export const DEFAULT_BODY_MEDIA_WIDTH = 70;
export const MIN_BODY_MEDIA_WIDTH = 25;
export const MAX_BODY_MEDIA_WIDTH = 100;

export function splitEventBodyParagraphs(body: string) {
  return (body || "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function clampBodyMediaPosition(position: unknown, paragraphCount: number) {
  const numeric = typeof position === "number" && Number.isFinite(position) ? Math.round(position) : paragraphCount;
  return Math.min(Math.max(numeric, 0), Math.max(paragraphCount, 0));
}

export function clampBodyMediaWidth(widthPercent: unknown) {
  const numeric =
    typeof widthPercent === "number" && Number.isFinite(widthPercent)
      ? Math.round(widthPercent)
      : DEFAULT_BODY_MEDIA_WIDTH;

  return Math.min(Math.max(numeric, MIN_BODY_MEDIA_WIDTH), MAX_BODY_MEDIA_WIDTH);
}

export function normalizeBodyMediaAlign(value: unknown): BodyMediaAlign {
  return value === "left" || value === "right" ? value : "center";
}

export function normalizeBodyMediaPlacement(
  placement: BodyMediaPlacement | undefined,
  paragraphCount: number,
): Required<BodyMediaPlacement> {
  return {
    position: clampBodyMediaPosition(placement?.position, paragraphCount),
    widthPercent: clampBodyMediaWidth(placement?.widthPercent),
    align: normalizeBodyMediaAlign(placement?.align),
  };
}

export function defaultBodyMediaPlacement(body: string): Required<BodyMediaPlacement> {
  return {
    position: splitEventBodyParagraphs(body).length,
    widthPercent: DEFAULT_BODY_MEDIA_WIDTH,
    align: "center",
  };
}
