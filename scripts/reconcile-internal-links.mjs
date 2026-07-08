import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const concepts = await prisma.concept.findMany({
    select: {
      slug: true,
      aliases: { select: { aliasSlug: true } }
    }
  });

  let canonicalLinks = 0;
  let aliasLinks = 0;

  for (const concept of concepts) {
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
    `Internal link reconciliation complete. Canonical links fixed: ${canonicalLinks}. Alias links fixed: ${aliasLinks}.`
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
