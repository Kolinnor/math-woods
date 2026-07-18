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
        orderBy: { publishedAt: "desc" },
        take: 50
      }
    }
  });
  if (!exploration || !canViewExploration(user, exploration)) notFound();

  return (
    <ForestPageLayout
      title={`${exploration.title}: history`}
      eyebrow="Change history"
      heroImage={exploration.coverImageUrl || "/art/playlists-forest-lodge.webp"}
      heroAlt="Exploration change history"
      description="Recent changes are recorded automatically."
      meta={<p>{exploration.editions.length} recent changes</p>}
      actions={<Link href={`/explorations/${exploration.slug}/start` as never} className="button secondary"><ArrowLeft size={16} /> Read</Link>}
    >
      <div className="exploration-edition-list">
        {exploration.editions.map((change) => (
          <article key={change.id} id={`change-${change.id}`}>
            <FileClock size={20} />
            <div>
              <h2>{change.changeSummary || "Published exploration"}</h2>
              <span className="muted text-sm">
                {change.publishedAt.toLocaleString("en-US")}
                {change.publishedBy ? ` / ${displayNameForUser(change.publishedBy)}` : ""}
              </span>
            </div>
          </article>
        ))}
        {exploration.editions.length === 0 && <p className="muted">No changes have been recorded yet.</p>}
      </div>
    </ForestPageLayout>
  );
}
