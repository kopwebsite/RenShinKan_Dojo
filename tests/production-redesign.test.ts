import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { examinationFeeThb, EXAM_APPLICATION_RANKS, formatThb } from "../shared/examFees";
import { onRequestPost as replaceProfilePhoto } from "../functions/api/records/profile-photo";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (path: string) => readFileSync(resolve(root, path), "utf8");

function splitSqlList(value: string) {
  const parts: string[] = [];
  let quote = "";
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index + 1] === quote) index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

describe("student database reliability redesign", () => {
  it("keeps the administrator student INSERT at exactly 26 columns and 26 values", () => {
    const source = file("functions/api/admin/students/index.ts");
    const match = source.match(/INSERT INTO students \(\s*([\s\S]*?)\s*\)\s*VALUES \(([\s\S]*?)\)\s*`/);
    expect(match).not.toBeNull();
    const columns = splitSqlList(match![1]);
    const values = splitSqlList(match![2]);
    expect(columns).toHaveLength(26);
    expect(values).toHaveLength(26);
    expect(columns.at(-1)).toBe("updated_at");
    expect(values.at(-1)).toBe("?");
  });

  it("uses stable ordering, no-store, and a structured error without converting failures to empty arrays", () => {
    const source = file("functions/api/admin/students/index.ts");
    expect(source).toContain("ORDER BY ${orderBy} ${direction}, s.id ASC");
    expect(source).toContain('"Cache-Control": "no-store"');
    expect(source).toContain('code: "STUDENT_LIST_QUERY_FAILED"');
    expect(source).toContain("Existing results were not replaced.");
  });

  it("adds only additive migration 0021 structures and retains confirmed versus self-reported AAT dates", () => {
    const migration = file("migrations/0021_student_workspace_reliability.sql");
    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN|INDEX)\b/i);
    for (const value of [
      "aat_self_reported_paid_date",
      "aat_membership_verification_status",
      "hours_quarters INTEGER",
      "fee_snapshot_thb INTEGER",
      "CREATE TABLE IF NOT EXISTS payment_requests",
      "CREATE TABLE IF NOT EXISTS payment_request_items",
      "CREATE TABLE IF NOT EXISTS student_profile_media",
      "CREATE TABLE IF NOT EXISTS download_assets",
    ]) expect(migration).toContain(value);
    const profile = file("functions/api/records/profile-requests.ts");
    expect(profile).toContain("aatSelfReportedPaidDate");
    expect(profile).toContain("aat_number, aat_last_paid_date");
    expect(profile).toContain("dojo.id, aatNumber, today, today, aatSelfReportedPaidDate");
    expect(profile).toContain("?, ?, ?, NULL, ?, ?, ?, ?)");
    expect(profile).not.toContain("aatLastPaidDate: aatSelfReportedPaidDate");
    expect(profile).toContain('hasAatMembership ? "self_reported" : "not_reported"');
  });
});

describe("exact fee and payment models", () => {
  it("maps every supported examination rank to the approved integer THB fee", () => {
    const expected = new Map([
      ["10 Kyu", 800], ["9 Kyu", 800], ["8 Kyu", 800], ["7 Kyu", 800], ["6 Kyu", 800],
      ["5 Kyu", 1100], ["4 Kyu", 1100],
      ["3 Kyu", 1400], ["2 Kyu", 1400], ["1 Kyu", 1400],
      ["SHO Dan-Ho", 2100], ["1st Dan", 2600],
    ]);
    expect(EXAM_APPLICATION_RANKS).toHaveLength(expected.size);
    for (const [rank, amount] of expected) expect(examinationFeeThb(rank), rank).toBe(amount);
    expect(examinationFeeThb("2nd Dan")).toBeNull();
    expect(examinationFeeThb("not-a-rank")).toBeNull();
    expect(formatThb(2600)).toBe("THB 2,600");
  });

  it("ignores client prices and creates one server-priced request header with student line items", () => {
    const source = file("functions/api/contributions.ts");
    expect(source).toContain("configuredAatAnnualContributionAmount(env)");
    expect(source).not.toMatch(/AAT_ANNUAL_AMOUNT_THB\s*=\s*\d+/);
    expect(file("wrangler.toml")).toContain('AAT_ANNUAL_CONTRIBUTION_AMOUNT = "1200"');
    expect(source).toContain("const totalAmount = unitAmount * students.length");
    expect(source).toContain("INSERT INTO payment_requests");
    expect(source).toContain("INSERT INTO payment_request_items");
    expect(source).not.toMatch(/body\.(?:amount|price|total)/);
  });

  it("prevents a dojo administrator from reviewing a mixed-dojo AAT group", () => {
    for (const path of ["functions/api/admin/payment-proofs.ts", "functions/api/admin/payment-proofs/[id].ts"]) {
      const source = file(path);
      expect(source).toContain("scoped_item.payment_request_id = p.payment_reference_id");
      expect(source).toContain("scoped_item.dojo_id <> ?");
    }
  });
});

describe("student-owned media and training provenance", () => {
  it("rejects profile replacement when the one-use owner session is invalid before writing R2", async () => {
    const put = vi.fn();
    const database = {
      prepare(query: string) {
        return {
          bind() { return this; },
          async first() {
            if (query.includes("mutation_requests")) return null;
            if (query.includes("FROM students")) return { id: "student-a", profile_image_url: null };
            if (query.includes("student_access_sessions")) return null;
            return null;
          },
          async all() { return { success: true, results: [] }; },
          async run() { return { success: true }; },
        };
      },
      async batch() { return []; },
    };
    const body = new FormData();
    body.set("studentId", "RSK-2601");
    body.set("accessToken", "invalid-owner-token");
    body.set("file", new File([new Uint8Array(64)], "photo.webp", { type: "image/webp" }));
    const response = await replaceProfilePhoto({
      request: new Request("https://example.test/api/records/profile-photo", { method: "POST", body }),
      env: {
        STUDENT_DB: database,
        MEDIA_BUCKET: { put, get: vi.fn(), delete: vi.fn() },
      },
    } as never);
    expect(response.status).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });

  it("stores only photo object metadata in D1 and preserves normalized training source details", () => {
    const photo = file("functions/api/records/profile-photo.ts");
    expect(photo).toContain("validStudentAccessSession");
    expect(photo).toContain("env.MEDIA_BUCKET.put(objectKey, image.bytes");
    expect(photo).toContain("INSERT INTO student_profile_media");
    expect(photo).toContain("(id, student_id, object_key, content_type, file_size, width, height, status, created_at)");
    expect(photo).not.toMatch(/\b(?:blob|image_data|binary_data)\b/i);
    const hours = file("functions/api/records/hours.ts");
    const approval = file("functions/api/admin/students/[id]/hours-requests.ts");
    for (const field of ["training_date", "source_type", "organization", "source_details", "student_notes", "hours_quarters"]) {
      expect(hours).toContain(field);
    }
    for (const field of ["source_type", "organization", "source_details", "notes", "hours_quarters"]) {
      expect(approval).toContain(field);
    }
    expect(hours).toContain("Math.abs(hoursQuarters / 4 - hours)");
  });
});

describe("interface and downloadable assets", () => {
  it("removes all Community Calendar routes and visible publishing surfaces while retaining dormant compatibility data", () => {
    for (const path of [
      "src/pages/CommunityPage.tsx",
      "src/components/Navbar.tsx",
      "src/components/admin/AdminNewsletterManager.tsx",
      "src/pages/AdminPage.tsx",
    ]) {
      expect(file(path), path).not.toMatch(/community calendar|upcoming-events|getCommunityCalendarEvents|calendarLabel/i);
    }
    expect(file("functions/api/admin/newsletters/save.ts")).toContain("rawEvent.showInCommunityCalendar = false");
  });

  it("provides newsletter bulk selection, obvious channel publishing, and no detached global publish block", () => {
    const manager = file("src/components/admin/AdminNewsletterManager.tsx");
    for (const value of ["Select this page", "Duplicate selected", "Move selected to Trash", "Publish selected destinations"]) {
      expect(manager).toContain(value);
    }
    expect(manager).not.toContain("Add to the community calendar");
    expect(file("src/pages/AdminPage.tsx")).not.toContain('sectionTitle("Save / Publish Changes"');
  });

  it("ships the two real PDFs and supports upload, metadata, replacement, publication, and ordering", () => {
    const assets = [
      ["public/downloads/aat-membership-application-en-th-2026.pdf", 100_000],
      ["public/downloads/aikido-grading-requirements-en-th-2026.pdf", 400_000],
    ] as const;
    for (const [path, minimumSize] of assets) {
      const absolute = resolve(root, path);
      expect(existsSync(absolute), path).toBe(true);
      expect(statSync(absolute).size).toBeGreaterThan(minimumSize);
      expect(readFileSync(absolute).subarray(0, 4).toString()).toBe("%PDF");
    }
    const api = file("functions/api/admin/downloads.ts");
    for (const value of ["onRequestPost", "onRequestPut", "onRequestPatch", "onRequestDelete", "download_file_replaced", "download_archived", "download_metadata_deleted", "published", "sort_order"]) {
      expect(api).toContain(value);
    }
    const admin = file("src/pages/AdminDownloadsPage.tsx");
    expect(admin).toContain("Archive");
    expect(admin).toContain("Delete metadata");
    expect(admin).toContain("window.confirm");
    const taxonomy = file("migrations/0022_download_categories.sql");
    expect(taxonomy).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN|INDEX)\b/i);
    expect(taxonomy).toContain("category_label");
    expect(taxonomy).toContain("rank_label");
    expect(file("src/pages/DownloadsPage.tsx")).toContain("Rank or audience");
    expect(file("src/components/Seo.tsx")).toContain('"/downloads"');
    for (const language of ["en", "th", "ja", "zh-CN"]) {
      expect(file(`src/i18n/${language}.json`)).toContain('"downloadsTitle"');
    }
  });

  it("uses accessible Gregorian pickers without slash-typed date fields", () => {
    const source = file("src/components/GregorianDateInput.tsx");
    for (const value of ['type="date"', 'type="datetime-local"', 'className={`gregorian-month-control', 't("date.monthLabel")', 't("date.yearLabel")', 'type="number"', 'inputMode="numeric"', 'min={1900}', 'max={maximumYear}']) {
      expect(source).toContain(value);
    }
    expect(source).toContain('t("date.monthMissing")');
    expect(source).toContain('t("date.yearMissing")');
    expect(source).not.toContain('placeholder="DD/MM/YYYY"');
    expect(source).not.toContain("showPicker");
  });

  it("opens the admin profile editor by default and bounds large passport histories", () => {
    const admin = file("src/pages/AdminStudentsPage.tsx");
    expect(admin).toContain("const [open, setOpen] = useState(true)");
    expect(admin).not.toContain("admin-task-prompt");
    const passport = file("src/components/studentPassport/DigitalPassport.tsx");
    expect(passport).toContain("entries.slice(0, 5)");
    expect(passport).toContain("exams.slice(0, 5)");
    expect(passport).toContain("const pageSize = 10");
  });
});
