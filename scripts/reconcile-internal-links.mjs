import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function slugify(input) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function main() {
  const concepts = await prisma.concept.findMany({
    select: {
      title: true,
      slug: true,
      aliases: { select: { aliasSlug: true } }
    }
  });

  let canonicalLinks = 0;
  let titleLinks = 0;
  let aliasLinks = 0;

  for (const concept of concepts) {
    const titleSlug = slugify(concept.title);
    if (titleSlug && titleSlug !== concept.slug) {
      const titleResult = await prisma.internalLink.updateMany({
        where: {
          exists: false,
          targetSlug: titleSlug
        },
        data: {
          targetSlug: concept.slug,
          exists: true,
          targetType: "CONCEPT"
        }
      });
      titleLinks += titleResult.count;
    }

    const canonicalResult = await prisma.internalLink.updateMany({
      where: {
        exists: false,
        targetSlug: concept.slug
      },
      data: {
        exists: true,
        targetType: "CONCEPT"
      }
    });
    canonicalLinks += canonicalResult.count;

    for (const alias of concept.aliases) {
      const aliasResult = await prisma.internalLink.updateMany({
        where: {
          exists: false,
          targetSlug: alias.aliasSlug
        },
        data: {
          exists: true,
          targetType: "CONCEPT"
        }
      });
      aliasLinks += aliasResult.count;
    }
  }

  console.log(
    `Internal link reconciliation complete. Canonical links fixed: ${canonicalLinks}. Title links fixed: ${titleLinks}. Alias links fixed: ${aliasLinks}.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
