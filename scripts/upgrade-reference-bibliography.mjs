import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { upgradeLegacyBibliography } from "../lib/reference-bibtex.ts";
import { normalizeReferenceDedupeKey } from "../lib/library.ts";

export async function upgradeReferenceBibliography(db, { check = true } = {}) {
  return db.$transaction(async tx => {
    const entries = await tx.libraryReference.findMany({ where: { bibliographyVersion: 0 } });
    const result = { upgraded: 0, needsReview: [] };
    for (const entry of entries) {
      let upgraded;
      try { upgraded = upgradeLegacyBibliography(entry); }
      catch { result.needsReview.push(entry.id); continue; }
      if (upgraded.citationKey && await tx.libraryReference.findFirst({ where: { id: { not: entry.id }, citationKey: { equals: upgraded.citationKey, mode: "insensitive" } }, select: { id: true } })) {
        result.needsReview.push(entry.id); continue;
      }
      const names = ["authors", "editors", "publisher", "year", "yearLabel", "edition", "volume", "translator", "journal", "issue", "pages", "url", "doi", "isbn", "citationKey"];
      const data = Object.fromEntries(names.map(name => [name, upgraded[name]]));
      const dedupeKey = normalizeReferenceDedupeKey({ ...upgraded, title: upgraded.canonicalTitle });
      const duplicate = await tx.libraryReference.findFirst({ where: { id: { not: entry.id }, dedupeKey }, select: { id: true } });
      if (!check) await tx.libraryReference.update({ where: { id: entry.id, updatedAt: entry.updatedAt }, data: { ...data, bibliographyVersion: 1, ...(duplicate ? {} : { dedupeKey }) } });
      result.upgraded++;
    }
    return result;
  }, { isolationLevel: "Serializable", timeout: 30000 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some(arg => !["--check", "--apply"].includes(arg))) throw new Error("Use --check or --apply");
  const db = new PrismaClient();
  try { console.log(JSON.stringify(await upgradeReferenceBibliography(db, { check: !process.argv.includes("--apply") }))); }
  finally { await db.$disconnect(); }
}
