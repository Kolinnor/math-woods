import { MathDomain, type Prisma } from "@prisma/client";
import { coarseDomainForCode, parseDomainCode } from "./domains.ts";

export const MAX_PROBLEM_DOMAINS = 3;

export type ParsedProblemDomain = {
  domain: MathDomain;
  mscCode: string;
  spoiler: boolean;
};

export function parseProblemDomains(
  values: FormDataEntryValue[],
  fallback: FormDataEntryValue | null,
  spoilerValues: FormDataEntryValue[] = []
) {
  const ordered = [...values, fallback].filter((value): value is FormDataEntryValue => value !== null);
  const spoilerCodes = new Set(spoilerValues.map((value) => parseDomainCode(value)));
  const domains: ParsedProblemDomain[] = [];
  const seenCodes = new Set<string>();

  for (const value of ordered) {
    const mscCode = parseDomainCode(value);
    if (!seenCodes.has(mscCode)) {
      domains.push({ domain: coarseDomainForCode(mscCode), mscCode, spoiler: spoilerCodes.has(mscCode) });
      seenCodes.add(mscCode);
    }
    if (domains.length >= MAX_PROBLEM_DOMAINS) break;
  }

  return domains.length ? domains : [{ domain: MathDomain.OTHER, mscCode: MathDomain.OTHER, spoiler: false }];
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
        update: { domain: domain.domain, position, spoiler: domain.spoiler },
        create: { problemId, domain: domain.domain, mscCode: domain.mscCode, position, spoiler: domain.spoiler }
      })
    )
  );
}
