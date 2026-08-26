import { defineConfig } from "@playwright/test";

const baseURL = process.env.VISUAL_BASE_URL ?? "https://mathwoods.org";

export default defineConfig({
  testDir: "./tests/visual",
  outputDir: "./test-results/visual",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report/visual" }]],
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.002
    }
  },
  use: {
    baseURL,
    channel: "chrome",
    colorScheme: "light",
    locale: "fr-FR",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "desktop-1440",
      use: { viewport: { width: 1440, height: 1000 } }
    },
    {
      name: "desktop-1920",
      use: { viewport: { width: 1920, height: 1080 } }
    }
  ]
});
