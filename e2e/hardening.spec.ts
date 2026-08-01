import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("public shell, hashed assets, and build identity are from one build", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
  const build = await request.get("/build.json");
  expect(build.ok()).toBe(true);
  expect(build.headers()["cache-control"]).toContain("no-cache");
  const { buildId } = (await build.json()) as { buildId: string };
  expect(await page.locator("html").getAttribute("data-build-id")).toBe(
    buildId,
  );
  const scripts = await page
    .locator('script[type="module"][src]')
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLScriptElement).src),
    );
  expect(
    scripts.some((url) =>
      /\/assets\/[^/]+-[A-Za-z0-9_-]+\.js$/.test(new URL(url).pathname),
    ),
  ).toBe(true);
});

test("private admin entry and APIs are not cached and direct routes do not flash content", async ({
  page,
  request,
}) => {
  const response = await page.goto("/admin/students");
  expect(response).not.toBeNull();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await expect(page.getByText("Student database", { exact: true })).toHaveCount(
    0,
  );
  expect(response!.headers()["cache-control"]).toContain("private");
  expect(response!.headers()["cache-control"]).toContain("no-store");
  const session = await request.get("/api/admin/session");
  expect(session.headers()["cache-control"]).toContain("private");
  expect(session.headers()["cache-control"]).toContain("no-store");
});

for (const path of ["/", "/student-records", "/admin"]) {
  test(`has no serious or critical axe violations at ${path}`, async ({
    page,
  }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter(
        (violation) =>
          violation.impact === "serious" || violation.impact === "critical",
      ),
    ).toEqual([]);
  });
}
