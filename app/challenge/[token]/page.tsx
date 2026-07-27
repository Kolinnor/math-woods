import type { Metadata } from "next";
import Link from "next/link";
import { Swords } from "lucide-react";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { acceptProblemChallengeInviteAction } from "@/lib/actions/problem-challenge-invite-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTranslations } from "@/lib/i18n/server";
import {
  normalizeProblemChallengeInviteToken,
  problemChallengeInviteTokenHash
} from "@/lib/problem-challenge-invites";
import { heroArtForProblemDomain } from "@/lib/problem-hero-art";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
};

export default async function ProblemChallengeInvitePage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: tokenValue } = await params;
  const token = normalizeProblemChallengeInviteToken(tokenValue);
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations()]);
  const invite = token
    ? await prisma.problemChallengeInvite.findUnique({
        where: { tokenHash: problemChallengeInviteTokenHash(token) },
        select: {
          challengerId: true,
          message: true,
          expiresAt: true,
          acceptedById: true,
          challenger: {
            select: {
              username: true,
              displayName: true,
              deletedAt: true
            }
          },
          problem: {
            select: {
              slug: true,
              title: true,
              difficulty: true,
              domain: true,
              listed: true,
              status: true
            }
          }
        }
      })
    : null;
  const availableInvite =
    invite &&
    !invite.challenger.deletedAt &&
    invite.expiresAt > new Date() &&
    invite.problem.listed &&
    invite.problem.status === "PUBLISHED"
      ? invite
      : null;
  const hero = availableInvite ? heroArtForProblemDomain(availableInvite.problem.domain) : null;
  const returnTo = token ? `/challenge/${encodeURIComponent(token)}` : "/";

  return (
    <ForestPageLayout
      title={t.social.challengeLink.invitationTitle}
      description={t.social.challengeLink.invitationDescription}
      heroImage={hero?.src}
      heroAlt={hero?.alt}
      workspaceClassName="forest-page-workspace-narrow"
    >
      {!availableInvite ? (
        <section className="panel challenge-invite-unavailable">
          <Swords size={34} aria-hidden="true" />
          <p>{t.social.challengeLink.unavailable}</p>
          <Link href="/problems" className="button secondary">{t.nav.problems}</Link>
        </section>
      ) : (
        <section className="challenge-invite-card">
          <header>
            <div className="problem-challenge-mark" aria-hidden="true">
              <Swords size={28} />
            </div>
            <div>
              <p>{t.social.challengeLink.challengedBy(displayNameForUser(availableInvite.challenger))}</p>
              <h2><AsyncMarkdownInline markdown={availableInvite.problem.title} /></h2>
            </div>
          </header>

          {availableInvite.message && <blockquote>{availableInvite.message}</blockquote>}

          <div className="challenge-invite-problem-meta">
            {availableInvite.problem.difficulty !== null && <span>{availableInvite.problem.difficulty}/100</span>}
          </div>

          {availableInvite.acceptedById ? (
            <div className="challenge-invite-status">
              <p>
                {availableInvite.acceptedById === user?.id
                  ? t.social.challengeLink.accepted
                  : t.social.challengeLink.claimed}
              </p>
              {availableInvite.acceptedById === user?.id && (
                <Link href={`/problems/${availableInvite.problem.slug}`} className="button">
                  {t.social.challengeLink.viewProblem}
                </Link>
              )}
            </div>
          ) : user?.id === availableInvite.challengerId ? (
            <div className="challenge-invite-status">
              <p>{t.social.challengeLink.ownLink}</p>
              <Link href={`/problems/${availableInvite.problem.slug}`} className="button secondary">
                {t.social.challengeLink.viewProblem}
              </Link>
            </div>
          ) : user ? (
            <div className="challenge-invite-actions">
              <form action={acceptProblemChallengeInviteAction.bind(null, token!)}>
                <button type="submit">
                  <Swords size={17} aria-hidden="true" />
                  {t.social.challengeLink.accept}
                </button>
              </form>
              <Link href={`/problems/${availableInvite.problem.slug}`} className="button secondary">
                {t.social.challengeLink.viewProblem}
              </Link>
            </div>
          ) : (
            <div className="challenge-invite-actions">
              <Link
                href={`/login?returnTo=${encodeURIComponent(returnTo)}` as never}
                className="button"
              >
                {t.social.challengeLink.signInToAccept}
              </Link>
              <Link href={`/problems/${availableInvite.problem.slug}`} className="button secondary">
                {t.social.challengeLink.viewProblem}
              </Link>
            </div>
          )}
        </section>
      )}
    </ForestPageLayout>
  );
}
