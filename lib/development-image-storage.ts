import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const imageTypes: Record<string, string> = { avif: "image/avif", jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const directory = () => path.join(process.cwd(), "runtime", "development-images");

export function developmentImageStorageEnabled(requestUrl: string) {
  if (process.env.NODE_ENV !== "development") return false;
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(requestUrl).hostname);
}

export async function writeDevelopmentImage(body: Buffer, contentType: string) {
  if (process.env.NODE_ENV !== "development") throw new Error("Local image storage is development-only.");
  const extension = Object.keys(imageTypes).find(key => imageTypes[key] === contentType);
  if (!extension) throw new Error("Unsupported image type.");
  const filename = `${randomUUID()}.${extension}`;
  await mkdir(directory(), { recursive: true });
  await writeFile(path.join(directory(), filename), body, { flag: "wx" });
  return { key: filename, publicUrl: `/api/images/local/${filename}` };
}

export async function readDevelopmentImage(filename: string) {
  if (process.env.NODE_ENV !== "development" || !/^[0-9a-f-]{36}\.(avif|jpg|png|webp)$/.test(filename)) return null;
  try {
    const body = await readFile(path.join(directory(), filename));
    return { body, contentType: imageTypes[filename.split(".").pop()!] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
