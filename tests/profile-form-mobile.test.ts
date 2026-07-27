import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("student profile form on desktop and mobile", () => {
  const page = file("src/pages/StudentRecordsPage.tsx");
  const css = file("src/index.css");

  it("uses a month-and-year start picker and stores a readable approximate value", () => {
    expect(page).toContain("GregorianMonthInput");
    expect(page).toContain("Choose a month and year. An approximate answer is fine.");
    expect(page).toContain("formatGregorianMonth");
    expect(page).toContain("approximatePracticeDuration(practiceStartMonth)");
  });

  it("lets phones offer their photo library instead of forcing the camera", () => {
    expect(page).toContain('accept="image/*"');
    expect(page).toContain("Choose one from your photo library or take a new photo.");
    expect(page).not.toMatch(/\bcapture=/);
  });

  it("keeps the optional AAT status full-width and stacks controls on small screens", () => {
    expect(page).toContain("You can leave this whole section blank.");
    expect(css).toContain(".student-aat-payment-date, .student-aat-note { grid-column: 1 / -1; }");
    expect(css).toContain(".student-aat-card__grid { grid-template-columns: 1fr; }");
    expect(css).toContain(".student-long-form :is(input, select, textarea) { font-size: 1rem; }");
  });
});
