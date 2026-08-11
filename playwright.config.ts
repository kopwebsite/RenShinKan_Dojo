import { defineConfig, devices } from "@playwright/test";

const externalBaseURL = process.env.RSK_E2E_BASE_URL?.replace(/\/$/, "");
const baseURL = externalBaseURL || "https://127.0.0.1:8788";

export default defineConfig({
  testDir: "./e2e",
  testIgnore:
    process.env.CAPTURE_HELP_SCREENSHOTS === "1"
      ? []
      : ["**/help-screenshots.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command: `"${process.execPath}" scripts/start-pages-smoke.mjs`,
        url: baseURL,
        ignoreHTTPSErrors: true,
        reuseExistingServer: false,
        timeout: 480_000,
      },
});
