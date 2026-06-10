import { notFound } from "next/navigation";
import { frontmatter, markdownResponse } from "@/lib/export-markdown";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const playlist = await prisma.playlist.findUnique({
    where: { slug },
    include: {
      author: true,
      items: {
        include: { problem: true },
        orderBy: { position: "asc" }
      }
    }
  });

  if (!playlist) notFound();

  const itemMarkdown = playlist.items
    .map((item) => {
      const note = item.noteMarkdown ? `\n\n${item.noteMarkdown}` : "";
      return `${item.position}. [[${item.problem.title}]] (${item.problem.slug})${note}`;
    })
    .join("\n\n");
  const markdown =
    frontmatter({
      type: "playlist",
      title: playlist.title,
      slug: playlist.slug,
      author: playlist.author.username,
      visibility: playlist.visibility.toLowerCase()
    }) +
    `${playlist.descriptionMarkdown}\n\n## Problems\n\n${itemMarkdown}\n`;

  return markdownResponse(markdown, `${playlist.slug}.md`);
}
