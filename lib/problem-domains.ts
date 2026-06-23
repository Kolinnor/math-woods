import { MathDomain, type Prisma } from "@prisma/client";
import { coarseDomainForCode, parseDomainCode } from "@/lib/domains";

export const MAX_PROBLEM_DOMAINS = 3;

export type ParsedProblemDomain = {
  domain: MathDomain;
  mscCode: string;
};

export function parseProblemDomains(values: FormDataEntryValue[], fallback: FormDataEntryValue | null) {
  const ordered = [...values, fallback].filter((value): value is FormDataEntryValue => value !== null);
  const domains: ParsedProblemDomain[] = [];
  const seenCodes = new Set<string>();

  for (const value of ordered) {
    const mscCode = parseDomainCode(value);
    if (!seenCodes.has(mscCode)) {
      domains.push({ domain: coarseDomainForCode(mscCode), mscCode });
      seenCodes.add(mscCode);
    }
    if (domains.length >= MAX_PROBLEM_DOMAINS) break;
  }

  return domains.length ? domains : [{ domain: MathDomain.OTHER, mscCode: MathDomain.OTHER }];
}

export async function syncProblemDomains(
  tx: Prisma.TransactionClient,
  problemId: number,
  domains: ParsedProblemDomain[]
) {
  const limitedDomains = domains.slice(0, MAX_PROBLEM_DOMAINS);
  const mscCodes = limitedDomains.map((domain) => domain.mscCode);

  await tx.problemDomain.deleteMany({
    where: {
      problemId,
      mscCode: { notIn: mscCodes }
    }
  });

  await Promise.all(
    limitedDomains.map((domain, position) =>
      tx.problemDomain.upsert({
        where: { problemId_mscCode: { problemId, mscCode: domain.mscCode } },
        update: { domain: domain.domain, position },
        create: { problemId, domain: domain.domain, mscCode: domain.mscCode, position }
      })
    )
  );
}
