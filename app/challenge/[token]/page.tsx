import type { Metadata } from "next";
import Link from "next/link";
import { Swords } from "lucide-react";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { UserAvatar } from "@/components/UserAvatar";
import { acceptProblemChallengeInviteAction } from "@/lib/actions/problem-challenge-invite-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTranslations } from "@/lib/i18n/server";
import { markdownExcerpt } from "@/lib/metadata-text";
import {
  normalizeProblemChallengeInviteToken,
  problemChallengeInviteTokenHash
} from "@/lib/problem-challenge-invites";
import { heroArtForProblemDomain } from "@/lib/problem-hero-art";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

const challengeRobots = {
  index: false,
  follow: false
};

export async function generateMetadata({
  params
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token: tokenValue } = await params;
  const token = normalizeProblemChallengeInviteToken(tokenValue);
  const route = token ? `/challenge/${encodeURIComponent(token)}` : "/challenge";
  const image = token ? `${route}/opengraph-image` : "/icon.png";
  const fallbackTitle = "You have been challenged on Math Woods";
  const fallbackDescription = "A mathematical problem is waiting for you.";

  if (!token) {
    return {
      title: fallbackTitle,
      description: fallbackDescription,
      robots: challengeRobots
    };
  }

  const invite = await prisma.problemChallengeInvite.findUnique({
    where: { tokenHash: problemChallengeInviteTokenHash(token) },
    select: {
      expiresAt: true,
      challenger: {
        select: {
          username: true,
          displayName: true,
          deletedAt: true
        }
      },
      problem: {
        select: {
          title: true,
          language: true,
          listed: true,
          status: true
        }
      }
    }
  });
  const availableInvite =
    invite &&
    !invite.challenger.deletedAt &&
    invite.expiresAt > new Date() &&
    invite.problem.listed &&
    invite.problem.status === "PUBLISHED"
      ? invite
      : null;

  const challengerName = availableInvite ? displayNameForUser(availableInvite.challenger) : null;
  const problemTitle = availableInvite
    ? markdownExcerpt(availableInvite.problem.title, "a Math Woods problem", 120)
    : null;
  const isFrench = availableInvite?.problem.language === "fr";
  const title = challengerName
    ? isFrench
      ? `${challengerName} vous lance un défi sur Math Woods`
      : `${challengerName} challenged you on Math Woods`
    : fallbackTitle;
  const description = problemTitle
    ? isFrench
      ? `Saurez-vous résoudre « ${problemTitle} » ? Acceptez le défi sur Math Woods.`
      : `Can you solve “${problemTitle}”? Accept the challenge on Math Woods.`
    : fallbackDescription;

  return {
    title,
    description,
    robots: challengeRobots,
    openGraph: {
      title,
      description,
      url: route,
      siteName: "Math Woods",
      type: "website",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: "Crossed swords for a Math Woods challenge"
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image]
    }
  };
}

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
              <div className="user-name-with-avatar">
                <UserAvatar user={availableInvite.challenger} size="xs" />
                <p>{t.social.challengeLink.challengedBy(displayNameForUser(availableInvite.challenger))}</p>
              </div>
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
