import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { chromium } from "@playwright/test";

const executablePath = chromium.executablePath();

try {
  await access(executablePath, constants.X_OK);
  console.log("Playwright Chromium is installed.");
} catch {
  console.error("Playwright Chromium is not installed.");
  console.error("Run:");
  console.error("npx playwright install chromium");
  process.exitCode = 1;
}
