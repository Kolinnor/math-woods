import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { prisma } from "@/lib/db";
import { contentLanguageLabel } from "@/lib/languages";
import { pluralize } from "@/lib/pluralize";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  const preferredLanguage = await getPreferredContentLanguage();
  const playlists = await prisma.playlist.findMany({
    where: { language: preferredLanguage },
    orderBy: { createdAt: "desc" },
    include: {
      author: true,
      items: true,
      _count: { select: { followers: true } }
    }
  });

  return (
    <ForestPageLayout
      title="Playlists"
      eyebrow="Learning paths"
      heroImage="/art/playlists-forest-lodge.webp"
      heroAlt="Ivan Shishkin, Forest Lodge"
      description={`Ordered paths for learning through ${contentLanguageLabel(preferredLanguage).toLowerCase()} problems.`}
      meta={
        <>
          <p>{pluralize(playlists.length, "playlist")}</p>
          <p>{contentLanguageLabel(preferredLanguage)}</p>
        </>
      }
      actions={
        <Link href="/playlists/new" className="button">
          New
        </Link>
      }
    >
      <div className="grid gap-3">
        {playlists.map((playlist) => (
          <Link key={playlist.id} href={`/playlists/${playlist.slug}`} className="panel block p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">{playlist.title}</h2>
                <p className="muted text-sm">by {displayNameForUser(playlist.author)}</p>
              </div>
              <span className="muted text-sm">
                {pluralize(playlist.items.length, "problem")} · {pluralize(playlist._count.followers, "follower")}
              </span>
            </div>
          </Link>
        ))}
        {playlists.length === 0 && <p className="muted panel p-5">No playlists yet.</p>}
      </div>
    </ForestPageLayout>
  );
}
