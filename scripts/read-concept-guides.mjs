// Sent over SSH on stdin: deliberately self-contained so it also works with the
// production image preceding the introduction of Markdown guide files.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const rows = await prisma.conceptContributorGuideContent.findMany({
    where: { language: { in: ["en", "fr"] } },
    select: { language: true, title: true, description: true, bodyMarkdown: true }
  });
  const guides = Object.fromEntries(["en", "fr"].map((language) => {
    const path = join(process.cwd(), "content", "guides", "concepts", `${language}.md`);
    return [language, {
      stored: rows.find((row) => row.language === language) ?? null,
      deployedMarkdown: existsSync(path) ? readFileSync(path, "utf8") : null
    }];
  }));
  console.log(JSON.stringify({ version: 1, guides }));
} finally {
  await prisma.$disconnect();
}
