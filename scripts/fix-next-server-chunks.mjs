import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const serverDir = join(process.cwd(), ".next", "server");
const chunksDir = join(serverDir, "chunks");

try {
  await mkdir(chunksDir, { recursive: true });
  const entries = await readdir(chunksDir, { withFileTypes: true });
  const chunkFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => entry.name);

  for (const file of chunkFiles) {
    await copyFile(join(chunksDir, file), join(serverDir, file));
  }

  console.log(`Copied ${chunkFiles.length} server chunks for next start.`);
} catch (error) {
  console.warn("Could not copy Next server chunks:", error);
}
