import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5183",
    trace: "off",
    video: "off",
  },
  projects: [
    { name: "edge", use: { channel: "msedge" } },
    { name: "chrome", use: { channel: "chrome" } },
  ],
});
