import { Prisma } from "@prisma/client";
import { Parser } from "htmlparser2";
import { prisma } from "@/lib/db";
import { renderInlineMarkdown } from "@/lib/markdown";
import { cleanWikiLinkLabel } from "@/lib/wikilinks";

function problemSlug(href: string) {
  // Only page links: a link to a solution/discussion can have its own title.
  if (!href.startsWith("/problems/") && !/^https?:\/\/(?:www\.)?mathwoods\.org\//i.test(href)) return null;
  try {
    return new URL(href, "https://mathwoods.org").pathname.match(/^\/problems\/([a-z0-9-]+)\/?$/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

function problemAnchors(html: string) {
  const anchors: { slug: string; from: number; to: number; label: string }[] = [];
  const protectedStack: boolean[] = [];
  let anchor: { slug: string; from: number } | null = null;
  const parser = new Parser({
    onopentag(name, attributes) {
      const protectedParent = Boolean(protectedStack.at(-1));
      protectedStack.push(protectedParent || ["pre", "code", "math", "svg"].includes(name));
      if (name !== "a" || protectedParent) return;
      const slug = problemSlug(attributes.href ?? "");
      if (slug) anchor = { slug, from: parser.endIndex + 1 };
    },
    onclosetag(name) {
      if (name === "a" && anchor) {
        anchors.push({ ...anchor, to: parser.startIndex, label: html.slice(anchor.from, parser.startIndex) });
        anchor = null;
      }
      protectedStack.pop();
    }
  });
  parser.end(html);
  return anchors;
}

// Display-only: do not rewrite authored Markdown, revisions or custom link prose.
// Batch lookups across the statement and all solutions; no persistent title cache.
export async function refreshProblemLinkTitles(htmls: readonly string[]) {
  const anchorsByDocument = htmls.map(problemAnchors);
  const slugs = [...new Set(anchorsByDocument.flat().map(anchor => anchor.slug))];
  if (!slugs.length) return [...htmls];

  const problems = await prisma.problem.findMany({
    where: {
      status: "PUBLISHED", listed: true,
      OR: [{ slug: { in: slugs } }, { slugRedirects: { some: { sourceSlug: { in: slugs } } } }]
    },
    select: {
      id: true, slug: true, title: true,
      slugRedirects: { where: { sourceSlug: { in: slugs } }, select: { sourceSlug: true } }
    }
  });
  if (!problems.length) return [...htmls];

  // Fetch distinct title strings only, not potentially large statement snapshots.
  const historicalTitles = await prisma.$queryRaw<{ pageId: number; title: string }[]>(Prisma.sql`
    SELECT DISTINCT "pageId", "problemSnapshot"->>'title' AS title
    FROM "PageRevision"
    WHERE "pageType" = 'PROBLEM' AND "pageId" IN (${Prisma.join(problems.map(problem => problem.id))})
      AND "problemSnapshot"->>'schemaVersion' = '1'
      AND jsonb_typeof("problemSnapshot"->'title') = 'string'
  `);
  const renderedTitles = new Map<string, Promise<string>>();
  const renderTitle = (title: string) => {
    if (!renderedTitles.has(title)) renderedTitles.set(title, renderInlineMarkdown(title));
    return renderedTitles.get(title)!;
  };
  const replacementsBySlug = new Map<string, { current: string; known: Set<string> }>();
  await Promise.all(problems.map(async problem => {
    const titles = new Set([problem.title, ...historicalTitles.filter(row => row.pageId === problem.id).map(row => row.title)]);
    // The editor normalizes labels when inserting links; also accept manually
    // authored titles without that normalization (notably LaTeX brackets).
    const known = new Set(await Promise.all([...titles].flatMap(title => [renderTitle(title), renderTitle(cleanWikiLinkLabel(title))])));
    const current = await renderTitle(problem.title);
    // Do not insert nested anchors or images from an unusual authored title.
    if (/<(?:a|img)\b/i.test(current)) return;
    const replacement = { current, known };
    for (const slug of [problem.slug, ...problem.slugRedirects.map(row => row.sourceSlug)]) {
      replacementsBySlug.set(slug, replacement);
    }
  }));

  return htmls.map((html, index) => {
    for (const anchor of [...anchorsByDocument[index]].reverse()) {
      const replacement = replacementsBySlug.get(anchor.slug);
      if (!replacement?.known.has(anchor.label)) continue;
      html = html.slice(0, anchor.from) + replacement.current + html.slice(anchor.to);
    }
    return html;
  });
}
