import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { UserName } from "@/components/UserName";
import { requireModerator } from "@/lib/auth";
import { formatUserDateTime } from "@/lib/date-format";
import { prisma } from "@/lib/db";
import { getRequestTimeZone } from "@/lib/server-time-zone";
import { profilePath } from "@/lib/usernames";

export const dynamic = "force-dynamic";

export default async function ProfileNameChangesPage() {
  await requireModerator();
  const [timeZone, changes] = await Promise.all([
    getRequestTimeZone(),
    prisma.displayNameChange.findMany({
      orderBy: { changedAt: "desc" },
      include: { user: true, actor: true },
      take: 200
    })
  ]);

  return (
    <ForestPageLayout
      title="Profile name history"
      eyebrow="Moderation"
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      description="Private history of visible profile-name changes."
      actions={
        <Link href="/moderation" className="button secondary">
          Back to moderation
        </Link>
      }
      meta={<p>{changes.length} recent changes</p>}
    >
      <div className="grid gap-3">
        {changes.map((change) => (
          <article key={change.id} className="panel flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium">
                {change.oldDisplayName} {" -> "} {change.newDisplayName}
              </p>
              <p className="muted text-sm">
                <Link href={profilePath(change.user)} className="underline">
                  <UserName user={change.user} />
                </Link>
                {change.actorId !== change.userId && (
                  <> changed by <UserName user={change.actor} /></>
                )}
              </p>
            </div>
            <time className="muted text-sm" dateTime={change.changedAt.toISOString()}>
              {formatUserDateTime(change.changedAt, timeZone)}
            </time>
          </article>
        ))}
        {changes.length === 0 && <p className="panel muted p-5">No profile-name changes yet.</p>}
      </div>
    </ForestPageLayout>
  );
}
