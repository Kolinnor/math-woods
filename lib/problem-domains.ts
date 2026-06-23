import { MathDomain, type Prisma } from "@prisma/client";
import { parseMathDomain } from "@/lib/domains";

export const MAX_PROBLEM_DOMAINS = 3;

export function parseProblemDomains(values: FormDataEntryValue[], fallback: FormDataEntryValue | null) {
  const ordered = [...values, fallback].filter((value): value is FormDataEntryValue => value !== null);
  const domains: MathDomain[] = [];

  for (const value of ordered) {
    const domain = parseMathDomain(value);
    if (!domains.includes(domain)) domains.push(domain);
    if (domains.length >= MAX_PROBLEM_DOMAINS) break;
  }

  return domains.length ? domains : [MathDomain.OTHER];
}

export async function syncProblemDomains(
  tx: Prisma.TransactionClient,
  problemId: number,
  domains: MathDomain[]
) {
  const limitedDomains = domains.slice(0, MAX_PROBLEM_DOMAINS);

  await tx.problemDomain.deleteMany({
    where: {
      problemId,
      domain: { notIn: limitedDomains }
    }
  });

  await Promise.all(
    limitedDomains.map((domain, position) =>
      tx.problemDomain.upsert({
        where: { problemId_domain: { problemId, domain } },
        update: { position },
        create: { problemId, domain, position }
      })
    )
  );
}
