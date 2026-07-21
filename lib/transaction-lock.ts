import type { Prisma } from "@prisma/client";

export async function acquireTransactionLock(tx: Prisma.TransactionClient, key: string) {
  await tx.$queryRaw<Array<{ lock: string }>>`
    SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS "lock"
  `;
}
