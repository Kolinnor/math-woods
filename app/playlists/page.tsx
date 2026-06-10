import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  const playlists = await prisma.playlist.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      author: true,
      items: true,
      _count: { select: { followers: true } }
    }
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Playlists</h1>
          <p className="muted mt-1">Ordered paths for learning through problems.</p>
        </div>
        <Link href="/playlists/new" className="button">
          New
        </Link>
      </div>

      <div className="grid gap-3">
        {playlists.map((playlist) => (
          <Link key={playlist.id} href={`/playlists/${playlist.slug}`} className="panel block p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">{playlist.title}</h2>
                <p className="muted text-sm">@{playlist.author.username}</p>
              </div>
              <span className="muted text-sm">
                {playlist.items.length} problems · {playlist._count.followers} followers
              </span>
            </div>
          </Link>
        ))}
        {playlists.length === 0 && <p className="muted panel p-5">No playlists yet.</p>}
      </div>
    </div>
  );
}
