export type PublicHelpAssistantLocale = "en" | "th";

export type PublicHelpAssistantResponse =
  { outcome: "match"; topicId: string } | { outcome: "unknown" | "private" };

export const publicHelpAssistantCopy = {
  en: {
    ask: "Ask website assistant",
    asking: "Finding a public help topic…",
    privacyNotice:
      "Do not enter names, email addresses, student IDs, payment details, or private links.",
    private:
      "For your privacy, remove personal or private information and try again. The guides below remain available.",
    unknown:
      "I can only match questions to the public website guides below. Try different words or contact the dojo.",
    rateLimited:
      "The assistant has reached its request limit. Please use the guides below and try again later.",
    unavailable:
      "The assistant is unavailable. The public guides below still work.",
  },
  th: {
    ask: "ถามผู้ช่วยเว็บไซต์",
    asking: "กำลังค้นหาหัวข้อช่วยเหลือสาธารณะ…",
    privacyNotice:
      "อย่าใส่ชื่อ อีเมล รหัสนักเรียน ข้อมูลการชำระเงิน หรือลิงก์ส่วนตัว",
    private:
      "เพื่อความเป็นส่วนตัว โปรดลบข้อมูลส่วนบุคคลหรือข้อมูลส่วนตัวแล้วลองอีกครั้ง คู่มือด้านล่างยังใช้งานได้",
    unknown:
      "ผู้ช่วยจับคู่ได้เฉพาะคำถามกับคู่มือเว็บไซต์สาธารณะด้านล่าง ลองใช้คำอื่นหรือติดต่อโดโจ",
    rateLimited:
      "ผู้ช่วยถึงขีดจำกัดคำขอแล้ว โปรดใช้คู่มือด้านล่างและลองใหม่ภายหลัง",
    unavailable: "ผู้ช่วยไม่พร้อมใช้งาน แต่คู่มือสาธารณะด้านล่างยังใช้งานได้",
  },
} as const;

function plainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function parsePublicHelpAssistantResponse(
  value: unknown,
): PublicHelpAssistantResponse | null {
  if (!plainObject(value)) return null;
  const keys = Object.keys(value).sort();
  if (value.outcome === "match") {
    return keys.length === 2 &&
      keys[0] === "outcome" &&
      keys[1] === "topicId" &&
      typeof value.topicId === "string" &&
      /^public-[a-z0-9-]+$/.test(value.topicId)
      ? { outcome: "match", topicId: value.topicId }
      : null;
  }
  if (
    (value.outcome === "unknown" || value.outcome === "private") &&
    keys.length === 1 &&
    keys[0] === "outcome"
  ) {
    return { outcome: value.outcome };
  }
  return null;
}
