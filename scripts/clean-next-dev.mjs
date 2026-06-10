import { rm } from "node:fs/promises";
import { join } from "node:path";

const nextDir = join(process.cwd(), ".next");

try {
  await rm(nextDir, { recursive: true, force: true });
  console.log("Cleaned .next before starting the dev server.");
} catch (error) {
  console.warn("Could not clean .next before dev:", error);
}
