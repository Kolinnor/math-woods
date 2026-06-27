import Link from "next/link";
import { notFound } from "next/navigation";
import { rollbackProblemRevisionAction } from "@/lib/actions/problem-actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

type DiffPart = {
  value: string;
  changed?: boolean;
};

type DiffRow = {
  kind: "context" | "removed" | "added";
  beforeLine?: number;
  afterLine?: number;
  parts: DiffPart[];
};

function tokenizeDiffLine(value: string) {
  return value.match(/\\[A-Za-z]+|\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) ?? [];
}

function lcsTable<T>(left: T[], right: T[], equals: (leftItem: T, rightItem: T) => boolean) {
  const table = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0) as number[]);

  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      table[leftIndex][rightIndex] = equals(left[leftIndex], right[rightIndex])
        ? table[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(table[leftIndex + 1][rightIndex], table[leftIndex][rightIndex + 1]);
    }
  }

  return table;
}

function diffTokens(before: string, after: string) {
  const beforeTokens = tokenizeDiffLine(before);
  const afterTokens = tokenizeDiffLine(after);
  const table = lcsTable(beforeTokens, afterTokens, (left, right) => left === right);
  const beforeParts: DiffPart[] = [];
  const afterParts: DiffPart[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeTokens.length || afterIndex < afterTokens.length) {
    if (
      beforeIndex < beforeTokens.length &&
      afterIndex < afterTokens.length &&
      beforeTokens[beforeIndex] === afterTokens[afterIndex]
    ) {
      beforeParts.push({ value: beforeTokens[beforeIndex] });
      afterParts.push({ value: afterTokens[afterIndex] });
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }

    if (
      afterIndex >= afterTokens.length ||
      (beforeIndex < beforeTokens.length && table[beforeIndex + 1][afterIndex] >= table[beforeIndex][afterIndex + 1])
    ) {
      beforeParts.push({ value: beforeTokens[beforeIndex], changed: true });
      beforeIndex += 1;
      continue;
    }

    afterParts.push({ value: afterTokens[afterIndex], changed: true });
    afterIndex += 1;
  }

  return { beforeParts, afterParts };
}

function splitLines(markdown: string) {
  return markdown.replace(/\r\n/g, "\n").split("\n");
}

function buildRevisionDiff(beforeMarkdown: string, afterMarkdown: string) {
  const beforeLines = splitLines(beforeMarkdown);
  const afterLines = splitLines(afterMarkdown);
  const table = lcsTable(beforeLines, afterLines, (left, right) => left === right);
  const rows: DiffRow[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeLines.length || afterIndex < afterLines.length) {
    if (
      beforeIndex < beforeLines.length &&
      afterIndex < afterLines.length &&
      beforeLines[beforeIndex] === afterLines[afterIndex]
    ) {
      rows.push({
        kind: "context",
        beforeLine: beforeIndex + 1,
        afterLine: afterIndex + 1,
        parts: [{ value: beforeLines[beforeIndex] || " " }]
      });
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }

    const removed: Array<{ line: number; value: string }> = [];
    const added: Array<{ line: number; value: string }> = [];

    while (
      beforeIndex < beforeLines.length &&
      (afterIndex >= afterLines.length || table[beforeIndex + 1][afterIndex] >= table[beforeIndex][afterIndex + 1]) &&
      !(afterIndex < afterLines.length && beforeLines[beforeIndex] === afterLines[afterIndex])
    ) {
      removed.push({ line: beforeIndex + 1, value: beforeLines[beforeIndex] });
      beforeIndex += 1;
    }

    while (
      afterIndex < afterLines.length &&
      (beforeIndex >= beforeLines.length || table[beforeIndex][afterIndex + 1] > table[beforeIndex + 1][afterIndex]) &&
      !(beforeIndex < beforeLines.length && beforeLines[beforeIndex] === afterLines[afterIndex])
    ) {
      added.push({ line: afterIndex + 1, value: afterLines[afterIndex] });
      afterIndex += 1;
    }

    const pairedCount = Math.min(removed.length, added.length);
    for (let index = 0; index < pairedCount; index += 1) {
      const { beforeParts, afterParts } = diffTokens(removed[index].value, added[index].value);
      rows.push({ kind: "removed", beforeLine: removed[index].line, parts: beforeParts });
      rows.push({ kind: "added", afterLine: added[index].line, parts: afterParts });
    }
    for (const item of removed.slice(pairedCount)) {
      rows.push({ kind: "removed", beforeLine: item.line, parts: [{ value: item.value || " ", changed: true }] });
    }
    for (const item of added.slice(pairedCount)) {
      rows.push({ kind: "added", afterLine: item.line, parts: [{ value: item.value || " ", changed: true }] });
    }
  }

  return rows;
}

export default async function ProblemHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const problem = await prisma.problem.findUnique({ where: { slug } });

  if (!problem) notFound();

  const revisions = await prisma.pageRevision.findMany({
    where: { pageType: "PROBLEM", pageId: problem.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { editedBy: true }
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Problem history</h1>
          <p className="muted mt-1">{problem.title}</p>
        </div>
        <Link href={`/problems/${problem.slug}`} className="button secondary">
          Back
        </Link>
      </div>

      <div className="grid gap-3">
        {revisions.map((revision, index) => {
          const previousRevision = revisions[index + 1];
          const diffRows = previousRevision ? buildRevisionDiff(previousRevision.markdown, revision.markdown) : [];
          const changedRows = diffRows.filter((row) => row.kind !== "context").length;

          return (
            <section key={revision.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Revision {revision.id}</h2>
                  <p className="muted text-sm">
                    {revision.createdAt.toLocaleString("en-US")}
                    {revision.editedBy ? ` / ${displayNameForUser(revision.editedBy)}` : ""}
                  </p>
                </div>
                <form action={rollbackProblemRevisionAction.bind(null, problem.id, revision.id)}>
                  <button type="submit" className="secondary">
                    Roll back
                  </button>
                </form>
              </div>
              <p className="mt-3">{revision.editSummary || "No edit summary."}</p>
              {previousRevision ? (
                <details className="revision-diff mt-3" open={index === 0}>
                  <summary>
                    <span>Compare with revision {previousRevision.id}</span>
                    <small>{changedRows ? `${changedRows} changed lines` : "No text changes"}</small>
                  </summary>
                  <div className="revision-diff-table" role="table" aria-label={`Revision ${revision.id} diff`}>
                    {diffRows.map((row, rowIndex) => (
                      <div key={`${row.kind}-${rowIndex}`} className={`revision-diff-row revision-diff-${row.kind}`} role="row">
                        <span className="revision-diff-marker" aria-hidden="true">
                          {row.kind === "removed" ? "-" : row.kind === "added" ? "+" : " "}
                        </span>
                        <span className="revision-diff-line">{row.kind === "added" ? row.afterLine : row.beforeLine}</span>
                        <code>
                          {row.parts.map((part, partIndex) => (
                            <span key={partIndex} className={part.changed ? "revision-diff-highlight" : undefined}>
                              {part.value}
                            </span>
                          ))}
                        </code>
                      </div>
                    ))}
                  </div>
                </details>
              ) : (
                <pre className="revision-preview mt-3 max-h-48 overflow-auto rounded p-3 text-xs">{revision.markdown}</pre>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
