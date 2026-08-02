import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("public help is contextual, searchable, keyboard-safe, and directly linkable", async ({
  page,
}) => {
  await page.goto("/student-records");
  const trigger = page.getByRole("button", { name: "Open website help" });
  const box = await trigger.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await trigger.click();
  const dialog = page.locator('.help-panel[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toHaveAccessibleName("How to use this website");
  await expect(
    dialog.getByRole("heading", { name: "Suggested for this page" }),
  ).toBeVisible();
  await expect(
    dialog
      .getByRole("button", { name: /How do I make a new student profile/ })
      .first(),
  ).toBeVisible();
  const search = dialog.getByRole("searchbox", { name: "Search help" });
  await expect(search).toBeFocused();
  await search.fill("exam application");
  await expect(dialog.getByRole("status")).toContainText(/\d+ topics?/);
  await dialog
    .getByRole("button", { name: /How do I fill out an exam application/ })
    .click();
  await expect(page).toHaveURL(/help=public-exam-application/);
  await expect(
    dialog.getByRole("heading", {
      name: "How do I fill out an exam application?",
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Thai search and admin help use the correct audience catalog", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("rsk-lang", "th");
    localStorage.setItem("rsk-admin-lang", "th");
  });
  await page.goto("/");
  await page.getByRole("button", { name: "เปิดคู่มือเว็บไซต์" }).click();
  const publicDialog = page.locator('.help-panel[role="dialog"]');
  await expect(publicDialog).toHaveAccessibleName("วิธีใช้เว็บไซต์");
  await publicDialog
    .getByRole("searchbox", { name: "ค้นหาคู่มือ" })
    .fill("โปรไฟล์นักเรียน");
  await expect(
    publicDialog.getByRole("button", {
      name: /สร้างโปรไฟล์นักเรียนใหม่อย่างไร/,
    }),
  ).toBeVisible();
  await publicDialog.getByRole("button", { name: "ปิดคู่มือ" }).click();

  await page.goto("/admin");
  const adminHelpTrigger = page.getByRole("button", {
    name: "เปิดคู่มือผู้ดูแล",
  });
  await expect(adminHelpTrigger).toContainText("คู่มือผู้ดูแล");
  await adminHelpTrigger.click();
  const adminDialog = page.locator('.help-panel[role="dialog"]');
  await expect(adminDialog).toHaveAccessibleName("วิธีใช้ระบบผู้ดูแล");
  await expect(adminDialog).toContainText("อนุมัติโปรไฟล์นักเรียนใหม่อย่างไร?");
  await expect(adminDialog).not.toContainText("Auggie");
});

test("mobile dialog respects the viewport, text enlargement, reduced motion, and WCAG checks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open website help" });
  const triggerBox = await trigger.boundingBox();
  expect(triggerBox!.x).toBeGreaterThanOrEqual(0);
  expect(triggerBox!.y + triggerBox!.height).toBeLessThanOrEqual(844);
  await trigger.click();
  const dialog = page.locator('.help-panel[role="dialog"]');
  await expect(dialog).toHaveAccessibleName("How to use this website");
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox?.width).toBe(390);
  expect(dialogBox?.height).toBeCloseTo(844, 0);
  expect(
    await dialog.evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  const larger = dialog.getByRole("button", { name: "Use larger help text" });
  await larger.click();
  await larger.click();
  await larger.click();
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    "hidden",
  );
  expect(
    await page
      .locator("#root")
      .evaluate((element) => element.hasAttribute("inert")),
  ).toBe(true);
  const violations = (
    await new AxeBuilder({ page }).include('[role="dialog"]').analyze()
  ).violations;
  expect(violations).toEqual([]);
});

test("every guide is complete written instruction without screenshots", async ({
  page,
}) => {
  await page.goto("/?help=public-new-profile");
  const dialog = page.locator('.help-panel[role="dialog"]');
  await expect(dialog).toHaveAccessibleName("How to use this website");
  await expect(
    dialog.getByRole("heading", {
      name: "How do I make a new student profile?",
    }),
  ).toBeVisible();
  const stepsHeading = dialog.getByRole("heading", { name: "Steps" });
  await stepsHeading.scrollIntoViewIfNeeded();
  await expect(stepsHeading).toBeVisible();
  await expect(dialog.locator("img")).toHaveCount(0);
  await expect(
    dialog.getByRole("link", { name: "Create a student profile" }),
  ).toBeVisible();
});
