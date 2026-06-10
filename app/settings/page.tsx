import Link from "next/link";
import { BackgroundStylePicker } from "@/components/BackgroundStylePicker";
import { changePasswordAction, revokeOtherSessionsAction } from "@/lib/actions/account-actions";
import { getCurrentSession, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: Promise<{ updated?: string }>;
}) {
  const user = await requireUser();
  const currentSession = await getCurrentSession();
  const params = searchParams ? await searchParams : {};
  const sessions = await prisma.session.findMany({
    where: {
      userId: user.id,
      expiresAt: { gt: new Date() }
    },
    orderBy: { lastSeenAt: "desc" }
  });

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="muted mt-1">Appearance, account security, and active sessions for @{user.username}.</p>
      </div>

      {params.updated === "password" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          Password updated. Other sessions were revoked.
        </p>
      )}
      {params.updated === "sessions" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          Other sessions were revoked.
        </p>
      )}

      <section className="panel p-5">
        <BackgroundStylePicker />
      </section>

      <section className="panel p-5">
        <h2 className="mb-4 text-lg font-semibold">Change password</h2>
        <form action={changePasswordAction} className="grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Current password</span>
            <input name="currentPassword" type="password" required />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">New password</span>
            <input name="newPassword" type="password" minLength={8} required />
          </label>
          <button type="submit">Update password</button>
        </form>
      </section>

      <section className="panel p-5">
        <h2 className="mb-2 text-lg font-semibold">Data tools</h2>
        <p className="muted mb-4 text-sm">Bring Markdown notes into Math Woods. Problem and concept pages can be exported individually.</p>
        <Link href="/import" className="button secondary">
          Import Markdown
        </Link>
      </section>

      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Active sessions</h2>
            <p className="muted text-sm">Sessions expire after 30 days.</p>
          </div>
          <form action={revokeOtherSessionsAction}>
            <button type="submit" className="secondary">
              Revoke others
            </button>
          </form>
        </div>

        <div className="grid gap-3">
          {sessions.map((session) => (
            <div key={session.id} className="rounded-md border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {session.id === currentSession?.id ? "Current session" : "Signed-in session"}
                </span>
                <span className="muted">Expires {formatDate(session.expiresAt)}</span>
              </div>
              <p className="muted mt-1">
                Created {formatDate(session.createdAt)}. Last seen {formatDate(session.lastSeenAt)}.
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
