import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: ".media-lab/playwright-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.QA_BASE_URL ?? "http://127.0.0.1:3001",
    viewport: { width: 1280, height: 832 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.QA_BASE_URL
    ? undefined
    : {
        command:
          "STEPLINT_VERIFY_BUILD=1 npm run build && STEPLINT_VERIFY_BUILD=1 npm start -- --hostname 127.0.0.1 --port 3001",
        url: "http://127.0.0.1:3001",
        reuseExistingServer: !process.env.CI,
        timeout: 180000,
      },
});
