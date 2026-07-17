import Link from "next/link";
import { ArrowLeft, FileClock } from "lucide-react";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canViewExploration } from "@/lib/explorations";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export default async function ExplorationHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const exploration = await prisma.playlist.findUnique({
    where: { slug },
    include: {
      collaborators: true,
      editions: {
        include: { publishedBy: true },
        orderBy: { version: "desc" }
      }
    }
  });
  if (!exploration || !canViewExploration(user, exploration)) notFound();

  return (
    <ForestPageLayout
      title={`${exploration.title}: editions`}
      eyebrow="Publication history"
      heroImage={exploration.coverImageUrl || "/art/playlists-forest-lodge.webp"}
      heroAlt="Exploration edition history"
      description="Every published edition is preserved so active reading sessions remain stable."
      actions={<Link href={`/explorations/${exploration.slug}/start` as never} className="button secondary"><ArrowLeft size={16} /> Read</Link>}
    >
      <div className="exploration-edition-list">
        {exploration.editions.map((edition) => (
          <article key={edition.id}>
            <FileClock size={20} />
            <div>
              <h2>Edition {edition.version}</h2>
              <p>{edition.changeSummary || "Published without a change summary."}</p>
              <span className="muted text-sm">
                {edition.publishedAt.toLocaleString("en-US")}
                {edition.publishedBy ? ` · ${displayNameForUser(edition.publishedBy)}` : ""}
              </span>
            </div>
          </article>
        ))}
        {exploration.editions.length === 0 && <p className="muted">No versioned edition has been published yet.</p>}
      </div>
    </ForestPageLayout>
  );
}
