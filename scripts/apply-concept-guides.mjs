import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  GUIDE_LANGUAGES, parseGuideMarkdown, parseGuideSnapshot, validateGuide, guideImportPlan
} from "../lib/concept-guide-files.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export async function applyGuides(prisma, { root = projectRoot, check = false } = {}) {
  const directory = join(root, "content", "guides", "concepts");
  const expected = parseGuideSnapshot(JSON.parse(readFileSync(join(directory, "site-snapshot.json"), "utf8")));
  const repository = Object.fromEntries(GUIDE_LANGUAGES.map((language) => [
    language, parseGuideMarkdown(readFileSync(join(directory, `${language}.md`), "utf8"), language)
  ]));

  return prisma.$transaction(async (tx) => {
    const rows = await tx.conceptContributorGuideContent.findMany({
      where: { language: { in: [...GUIDE_LANGUAGES] } },
      select: { language: true, title: true, description: true, bodyMarkdown: true, updatedAt: true }
    });
    const current = Object.fromEntries(GUIDE_LANGUAGES.map((language) => {
      const row = rows.find((item) => item.language === language);
      return [language, row ? validateGuide(row, language) : null];
    }));
    const changes = guideImportPlan(repository, expected, current);
    if (check) return changes;

    for (const language of changes) {
      const row = rows.find((item) => item.language === language);
      const { title, description, bodyMarkdown } = repository[language];
      const result = row
        ? await tx.conceptContributorGuideContent.updateMany({
            where: { language, updatedAt: row.updatedAt, title: row.title, description: row.description, bodyMarkdown: row.bodyMarkdown },
            data: { title, description, bodyMarkdown }
          })
        : await tx.conceptContributorGuideContent.createMany({
            data: [{ language, title, description, bodyMarkdown }], skipDuplicates: true
          });
      if (result.count !== 1) throw new Error(`Concurrent edit of ${language} guide. Deployment stopped; transaction rolled back.`);
    }
    return changes;
  }, { isolationLevel: "Serializable" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const prisma = new PrismaClient();
  try {
    if (process.argv.slice(2).some((arg) => arg !== "--check")) throw new Error("Usage: guides:apply [--check]");
    const check = process.argv.includes("--check");
    const changes = await applyGuides(prisma, { check });
    console.log(`Concept guides ${check ? "checked" : "synchronized"}: ${changes.length ? changes.join(", ") : "no changes"}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
