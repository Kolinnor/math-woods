import { PrismaClient } from "@prisma/client";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const EUCLID_PASSAGES = new Map([
  ["Euclide. Eléments. Livre 1.  Proposition 9", "Livre 1, proposition 9"],
  ["Euclide. Eléments. Livre 1.  Proposition 10", "Livre 1, proposition 10"],
  ["Euclide. Eléments. Livre 1.  Proposition 11", "Livre 1, proposition 11"],
  ["Euclide. Eléments. Livre 1.  Proposition 12", "Livre 1, proposition 12"],
  ["Euclide. Eléments. Livre 1. Théorème 4. Proposition 7", "Livre 1, théorème 4, proposition 7"],
  ["Euclide. Eléments. Livre 1. Théorème 5. Proposition 8", "Livre 1, théorème 5, proposition 8"],
  ["Euclide - Eléments - Livre 1 - Définition 10", "Livre 1, définition 10"]
]);
const normalize = (text) => text.trim().replace(/\s+/g, " ");
function passages(...values) { return [...new Set(values.filter(Boolean))].join(" · ") || null; }

export async function reconcileProblemReferences(prisma, { check = true } = {}) {
  return prisma.$transaction(async (tx) => {
    const refs = await tx.libraryReference.findMany({ where: { OR: [
      { dedupeKey: { startsWith: "legacy-origin:" } }, { dedupeKey: { startsWith: "legacy-concept-title:" } }
    ] }, include: { problemLinks: true, conceptLinks: true } });
    const target = refs.find((ref) => ref.canonicalTitle === "Euclide. Eléments" || (ref.canonicalTitle === "Éléments" && ref.authors === "Euclide"));
    const plan = [];
    if (target) {
      const problems = new Set(target.problemLinks.map((link) => link.problemId));
      const concepts = new Set(target.conceptLinks.map((link) => link.conceptId));
      for (const ref of refs) {
        const passage = [...EUCLID_PASSAGES].find(([title]) => normalize(title) === normalize(ref.canonicalTitle))?.[1];
        if (!passage || ref.mergedIntoId === target.id) continue;
        for (const link of ref.problemLinks) {
          if (problems.has(link.problemId)) throw new Error(`Euclid merge requires review: problem ${link.problemId} already cites both records. No changes applied.`);
          problems.add(link.problemId);
        }
        for (const link of ref.conceptLinks) {
          if (concepts.has(link.conceptId)) throw new Error(`Euclid merge requires review: concept ${link.conceptId} already cites both records. No changes applied.`);
          concepts.add(link.conceptId);
        }
        plan.push({ from: ref.id, to: target.id, title: ref.canonicalTitle, passage,
          problems: ref.problemLinks.map((link) => ({ key: link.citationKey, id: link.problemId, locator: passages(passage, link.locator), note: link.note })),
          concepts: ref.conceptLinks.map((link) => ({ id: link.conceptId, locator: passages(passage, link.locator), note: link.note })) });
      }
    }
    if (check) return plan;
    if (target) {
      const aliases = [...new Set([...target.aliases, "Euclide", "Euclid", "Elements", "Éléments", "Euclide. Eléments"])];
      if (target.canonicalTitle !== "Éléments" || target.authors !== "Euclide" || target.referenceType !== "BOOK" || JSON.stringify(target.aliases) !== JSON.stringify(aliases)) await tx.libraryReference.update({ where: { id: target.id }, data: {
        canonicalTitle: "Éléments", authors: "Euclide", referenceType: "BOOK",
        aliases
      } });
      for (const item of plan) {
        for (const link of item.problems) {
          await tx.problemLibraryReference.update({ where: { problemId_citationKey: { problemId: link.id, citationKey: link.key } },
            data: { referenceId: target.id, text: "Euclide — Éléments", locator: link.locator } });
        }
        for (const link of item.concepts) {
          await tx.conceptLibraryReference.update({ where: { conceptId_referenceId: { conceptId: link.id, referenceId: item.from } },
            data: { referenceId: target.id, text: "Euclide — Éléments", locator: link.locator } });
        }
        // Preserve each original record and slug for historical links and redirection.
        await tx.libraryReference.update({ where: { id: item.from }, data: { searchable: false, mergedIntoId: target.id } });
      }
      await tx.problemLibraryReference.updateMany({ where: { referenceId: target.id, text: "Euclide. Eléments" }, data: { text: "Euclide — Éléments" } });
      await tx.libraryReferenceTranslation.updateMany({ where: { referenceId: target.id, displayTitle: "Euclide. Eléments" }, data: { displayTitle: "Éléments" } });
    }
    return plan;
  }, { isolationLevel: "Serializable", timeout: 30_000 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const prisma = new PrismaClient();
  try {
    if (process.argv.slice(2).some((arg) => !["--apply", "--check"].includes(arg))) throw new Error("Usage: reconcile-problem-references [--check|--apply]");
    const plan = await reconcileProblemReferences(prisma, { check: !process.argv.includes("--apply") });
    console.log(JSON.stringify({ applied: process.argv.includes("--apply"), merges: plan }, null, 2));
  } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
  finally { await prisma.$disconnect(); }
}
