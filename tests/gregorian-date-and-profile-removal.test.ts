import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  canonicalDateToDisplay,
  displayDateTimeToCanonical,
  displayDateToCanonical,
  formatGregorianDate,
  formatGregorianDateTime,
  isCanonicalDate,
} from "../shared/date";
import en from "../src/i18n/en.json";
import th from "../src/i18n/th.json";
import zh from "../src/i18n/zh-CN.json";
import ja from "../src/i18n/ja.json";
import { adminPhraseKeys } from "../src/i18n/scopedAdmin";
import { scopedRecordPhraseKeys } from "../src/i18n/scopedRecords";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("strict Gregorian date boundaries", () => {
  it("preserves day/month order and validates real calendar dates", () => {
    expect(displayDateToCanonical("02/01/2026")).toBe("2026-01-02");
    expect(displayDateToCanonical("31/12/2026")).toBe("2026-12-31");
    expect(displayDateToCanonical("29/02/2028")).toBe("2028-02-29");
    expect(displayDateToCanonical("29/02/2027")).toBeNull();
    expect(displayDateToCanonical("31/02/2026")).toBeNull();
    expect(displayDateToCanonical("2/1/2026")).toBeNull();
    expect(isCanonicalDate("2026-02-31")).toBe(false);
  });

  it("round-trips canonical date-only values without timezone parsing", () => {
    expect(canonicalDateToDisplay("2026-01-02")).toBe("02/01/2026");
    expect(displayDateToCanonical(canonicalDateToDisplay("2026-01-02"))).toBe("2026-01-02");
    expect(formatGregorianDate("2026-01-02")).toBe("02/01/2026");
    for (const _language of ["en", "th", "zh-CN", "ja"]) {
      expect(formatGregorianDate("2026-01-02")).toBe("02/01/2026");
      expect(formatGregorianDate("2026-01-02")).not.toContain("2569");
    }
  });

  it("uses date-first 24-hour timestamps and strict local date-time input", () => {
    expect(formatGregorianDateTime("2026-01-02T03:04:00Z")).toBe("02/01/2026 10:04");
    expect(formatGregorianDateTime("2026-10-12T15:14")).toBe("12/10/2026 15:14");
    expect(displayDateTimeToCanonical("02/01/2026 10:04")).toBe("2026-01-02T10:04");
    expect(displayDateTimeToCanonical("31/02/2026 10:04")).toBeNull();
  });
});

describe("removed profile-information field", () => {
  const activeFiles = [
    "src/pages/StudentRecordsPage.tsx",
    "src/pages/AdminStudentsPage.tsx",
    "src/components/studentPassport/DigitalPassport.tsx",
    "src/types/studentRecord.ts",
    "functions/_lib/studentRecords.ts",
    "functions/api/records/profile-requests.ts",
    "functions/api/records/lookup.ts",
    "functions/api/admin/students/[id].ts",
  ];

  it("has no active UI, DTO, serializer, request, or API path", () => {
    for (const path of activeFiles) {
      expect(file(path), path).not.toMatch(/profileBio|profile_bio|Additional information for your profile|Public profile information|Profile information/);
    }
  });

  it("keeps the historical database column dormant instead of destroying data", () => {
    expect(file("migrations/0003_student_workflows.sql")).toContain("profile_bio");
    expect(file("migrations/0020_gregorian_student_id_sequences.sql")).not.toMatch(/profile_bio|UPDATE\s+students|DROP\s+COLUMN/i);
  });
});

function keys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

describe("translation parity and language isolation", () => {
  it("keeps every public dictionary key in all four languages", () => {
    const expected = keys(en).sort();
    expect(keys(th).sort()).toEqual(expected);
    expect(keys(zh).sort()).toEqual(expected);
    expect(keys(ja).sort()).toEqual(expected);
  });

  it("localizes the contribution and payment-proof flows instead of rendering English-only controls", () => {
    const contribution = file("src/components/ContributionForm.tsx");
    const proof = file("src/components/PaymentProofUpload.tsx");
    expect(contribution).toContain("useTranslation()");
    expect(contribution).toContain('t("contribution.who")');
    expect(contribution).toContain('t("contribution.errorSubmit")');
    expect(proof).toContain("useTranslation()");
    expect(proof).toContain('t("paymentProof.chooseFile")');
    expect(th.contribution.who).not.toBe(en.contribution.who);
    expect(zh.paymentProof.contactSensei).not.toBe(en.paymentProof.contactSensei);
    expect(ja.contribution.completePromptPay).not.toBe(en.contribution.completePromptPay);
  });

  it("keeps scoped Student Records and passport phrases in parity", () => {
    const phraseKeys = scopedRecordPhraseKeys();
    expect(phraseKeys.th).toEqual(phraseKeys.en);
    expect(phraseKeys["zh-CN"]).toEqual(phraseKeys.en);
    expect(phraseKeys.ja).toEqual(phraseKeys.en);
    expect(new Set(phraseKeys.en).size).toBe(phraseKeys.en.length);
    expect(phraseKeys.en.length).toBeGreaterThan(180);
  });

  it("keeps scoped administration phrases paired in English and Thai", () => {
    const phraseKeys = adminPhraseKeys();
    expect(phraseKeys.th).toEqual(phraseKeys.en);
    expect(new Set(phraseKeys.en).size).toBe(phraseKeys.en.length);
    expect(phraseKeys.en.length).toBeGreaterThan(350);
  });

  it("offers only English and Thai in admin with a separate preference", () => {
    const i18n = file("src/i18n/index.ts");
    const access = file("src/components/admin/AdminAccess.tsx");
    expect(i18n).toContain('export type AdminLanguage = "en" | "th"');
    expect(i18n).toContain('localStorage.setItem("rsk-admin-lang"');
    expect(access).toContain('<option value="en">English</option>');
    expect(access).toContain('<option value="th">ไทย</option>');
    expect(access).not.toContain('value="zh-CN"');
    expect(access).not.toContain('value="ja"');
  });

  it("preserves shared tokens while allowlisting public language hints", () => {
    const shared = file("src/pages/SharedStudentRecordPage.tsx");
    expect(shared).toContain('hint === "en" || hint === "th" || hint === "zh-CN" || hint === "ja"');
    expect(shared).toContain('url.searchParams.set("lang", next)');
    expect(shared).toContain('encodeURIComponent(token || "")');
    expect(shared).not.toMatch(/console\.(?:log|info|warn|error).*token/);
  });
});
