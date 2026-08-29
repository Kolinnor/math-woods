// Adds the "Link generously" section to installs whose contribution page was
// already seeded, since ensureEditableContributionPage() only seeds when the
// section table is empty. Idempotent: matching titles are left untouched.
// Usage: node scripts/backfill-link-guidance-section.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SECTION = {
  title: "Link generously",
  bodyMarkdown:
    "Write `[[Concept]]` to link a concept, or `[[Concept|visible text]]` when the sentence needs different wording: the target before `|` is what keeps every language connected to the same idea. Problems use ordinary Markdown links to `/problems/slug`. Linking to a page that does not exist yet is useful, not a mistake: it becomes a requested page, and every link you write appears as a backlink on the other side."
};

const sections = await prisma.contributionPageSection.findMany({ orderBy: { position: "asc" } });

if (sections.length === 0) {
  console.log("Contribution page not seeded yet; ensureEditableContributionPage() will add the section.");
} else if (sections.some((section) => section.title === SECTION.title)) {
  console.log("Section already present; nothing to do.");
} else {
  const position = Math.max(...sections.map((section) => section.position)) + 1;
  await prisma.contributionPageSection.create({ data: { position, ...SECTION } });
  console.log(`Added "${SECTION.title}" at position ${position}.`);
}

await prisma.$disconnect();
