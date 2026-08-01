import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (path: string) => readFileSync(resolve(root, path), "utf8");
const compact = (value: string) => value.replace(/\s+/g, " ");

describe("student profile form on desktop and mobile", () => {
  const page = file("src/pages/StudentRecordsPage.tsx");
  const css = file("src/index.css");
  const endpoint = file("functions/api/records/profile-requests.ts");

  it("uses a month-and-year start picker and stores a readable approximate value", () => {
    expect(page).toContain("GregorianMonthInput");
    expect(compact(page)).toContain(
      "Choose a month and year if you remember. An approximate answer is fine.",
    );
    expect(page).toContain("Optional");
    expect(page).toContain("formatGregorianMonth");
    expect(page).toContain("approximatePracticeDuration(practiceStartMonth)");
    expect(page).not.toMatch(/GregorianMonthInput[^>]+required/);
    expect(endpoint).not.toContain(
      "Tell us how long the student has practiced aikido.",
    );
  });

  it("lets phones offer their photo library instead of forcing the camera", () => {
    expect(page).toContain('accept="image/*"');
    expect(page).toContain(
      "Choose one from your photo library or take a new photo.",
    );
    expect(page).not.toMatch(/\bcapture=/);
  });

  it("keeps the optional AAT status full-width and stacks controls on small screens", () => {
    expect(page).toContain("I currently have an AAT annual membership");
    expect(page).toContain("No membership yet is okay.");
    expect(page).toContain("Self-reported until an administrator confirms it.");
    expect(compact(css)).toContain(
      ".student-aat-payment-date, .student-aat-note { grid-column: 1 / -1; }",
    );
    expect(compact(css)).toContain(
      ".student-aat-card__grid { grid-template-columns: 1fr; }",
    );
    expect(compact(css)).toContain(
      ".student-long-form :is(input, select, textarea) { font-size: 1rem; }",
    );
  });
});
