import { ProblemVerificationMode } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { ReportStatus, TargetType } from "@prisma/client";
import { Check, Flag, Heart, History, Lightbulb, MessageCircle, Pencil, Target, ThumbsUp, Users } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ContentTranslations } from "@/components/ContentTranslations";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { Difficulty } from "@/components/Difficulty";
import { GuestContentViewGate } from "@/components/GuestContentViewGate";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { ProblemChallengeLauncher } from "@/components/ProblemChallengeLauncher";
import { ProblemHints } from "@/components/ProblemHints";
import { ProblemReactions } from "@/components/ProblemReactions";
import { ProblemRecommendationExposure } from "@/components/ProblemRecommendationExposure";
import { UserAvatar } from "@/components/UserAvatar";
import { UserName } from "@/components/UserName";
import { reportProblemAction } from "@/lib/actions/moderation-actions";
import {
  createProblemHintFromProblemAction,
  dismissProblemTranslationStaleNoticeAction,
  markProblemReviewedAction,
  markProblemSolvedAction,
  startAttemptAction,
  toggleProblemFavoriteAction,
  unmarkProblemSolvedAction
} from "@/lib/actions/problem-actions";
import {
  createProofAction,
  saveSolutionHintAction,
  voteProofAction
} from "@/lib/actions/proof-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EXPLORATIONS_ENABLED } from "@/lib/feature-flags";
import { translatedDomainLabel } from "@/lib/domains";
import { contentLanguageLabel } from "@/lib/languages";
import { formatProblemSolvedDate, problemSolvedAt } from "@/lib/problem-solved-date";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { markdownExcerpt } from "@/lib/metadata-text";
import { renderInlineMarkdown } from "@/lib/markdown";
import {
  canEditProblem,
  canProposeProblemEdit,
  canEditSolution,
  canReviewProblem,
  canUseAdminTools,
  canUseModerationTools,
  canViewArchivedProblem
} from "@/lib/permissions";
import { canPublishProblemEditForProblem } from "@/lib/problem-edit-access";
import { isUnknownProblemOrigin } from "@/lib/problem-origin";
import { shouldShowOwnerSolvedBanner } from "@/lib/problem-owner-solved-banner";
import { recommendationsForUser } from "@/lib/recommendation-engine";
import { selectProblemHintsForLanguage } from "@/lib/problem-hints";
import { canViewProblem, visibleProblemWhere } from "@/lib/problem-visibility";
import { canViewProblemSolutions } from "@/lib/problem-solution-visibility";
import { COMMUNITY_ACCEPTED_PROOF_VOTES } from "@/lib/problems";
import { problemLinkClass } from "@/lib/problem-link";
import { problemStyleLabel } from "@/lib/problem-styles";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { solutionConcernIsPublic } from "@/lib/solution-reports";
import {
  renderMarkdownCollectionForContentLanguage,
  resolveConceptLinksForLanguage,
  resolveConceptTitlesForLanguage,
  resolveProblemLinksForLanguage
} from "@/lib/translated-markdown";
import { problemTranslationFreshness } from "@/lib/translation-freshness";
import {
  nextMissingTranslationLanguage,
  requestedTranslationLanguage,
  selectContentTranslation,
  TRANSLATION_VIEW_LANGUAGE_PARAM
} from "@/lib/translation-routing";
import { displayNameForUser } from "@/lib/user-display";
import { missingConceptHref } from "@/lib/wikilinks";

export const dynamic = "force-dynamic";

function titleFromConceptSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .join(" ");
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const problem = await prisma.problem.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      bodyMarkdown: true,
      translationGroupId: true,
      qualityStatus: true
    }
  });
  if (!problem) return {};

  const translations = await prisma.problem.findMany({
    where: { translationGroupId: problem.translationGroupId },
    select: { slug: true, language: true }
  });
  const description = markdownExcerpt(problem.bodyMarkdown, "A Math Woods problem.");

  return {
    title: `${problem.title} - Math Woods`,
    description,
    alternates: {
      canonical: `/problems/${problem.slug}`,
      languages: Object.fromEntries(
        translations.map((translation) => [translation.language, `/problems/${translation.slug}`])
      )
    },
    openGraph: {
      title: problem.title,
      description,
      url: `/problems/${problem.slug}`,
      siteName: "Math Woods",
      type: "article"
    },
    twitter: {
      card: "summary",
      title: problem.title,
      description
    }
  };
}

function verificationStatusLabel(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

const redesignCopy = {
  en: {
    solvedProgress: (done: number, total: number, domain: string) =>
      `Solved. You have solved ${done} of ${total} problems in ${domain}.`,
    ownerSolved: {
      writeSolution: "Help readers learn from your problem by writing a solution.",
      writeSolutionAction: "Write a solution",
      addRelated: "Give readers another way into this problem by creating a related problem.",
      addRelatedAction: "Add related problems",
      exerciseProgression: "Make sure readers have enough easier exercises to build up to this one."
    },
    solvedToo: "solved this too",
    next: "Next, if you liked this one",
    open: "Open it",
    tiles: {
      solveSub: "Mark it done",
      verifySub: "Check your answer",
      attemptSub: "Keep it in your list",
      attemptedSub: "In your working list",
      favoriteSub: (count: number) => `${count} ${count === 1 ? "like" : "likes"}`
    },
    favoriteUsers: {
      summary: "See who liked this problem",
      title: "Liked by"
    },
    reactions: {
      howWasIt: "How was it?",
      tooHard: "Too hard for me",
      tooEasy: "Too easy",
      feelsRight: "Difficulty feels right",
      more: "More problems like this",
      less: "Less problems like this",
      somethingElse: "Something else"
    }
  },
  fr: {
    solvedProgress: (done: number, total: number, domain: string) =>
      `Résolu. Vous avez résolu ${done} problèmes sur ${total} en ${domain}.`,
    ownerSolved: {
      writeSolution: "Aidez les lecteurs à apprendre grâce à votre problème en rédigeant une solution.",
      writeSolutionAction: "Rédiger une solution",
      addRelated: "Donnez aux lecteurs une autre façon d'aborder ce problème en ajoutant un problème lié.",
      addRelatedAction: "Ajouter des problèmes liés",
      exerciseProgression: "Vérifiez que les lecteurs disposent d'assez d'exercices plus faciles pour progresser jusqu'à celui-ci."
    },
    solvedToo: "ont aussi résolu ce problème",
    next: "Ensuite, si celui-ci vous a plu",
    open: "Ouvrir",
    tiles: {
      solveSub: "Marquer comme résolu",
      verifySub: "Vérifier votre réponse",
      attemptSub: "Le garder dans votre liste",
      attemptedSub: "Dans votre liste de travail",
      favoriteSub: (count: number) => `${count} J’aime`
    },
    favoriteUsers: {
      summary: "Voir les personnes qui ont aimé ce problème",
      title: "Aimé par"
    },
    reactions: {
      howWasIt: "Comment était-il ?",
      tooHard: "Trop difficile pour moi",
      tooEasy: "Trop facile",
      feelsRight: "Bonne difficulté",
      more: "Plus de problèmes comme celui-ci",
      less: "Moins de problèmes comme celui-ci",
      somethingElse: "Autre chose"
    }
  }
} as const;

export default async function ProblemPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{
    challenge?: string;
    hint?: string;
    solution?: string;
    translateHint?: string;
    verification?: string;
    editProposal?: string;
    viewLanguage?: string;
    tour?: string;
    recommended?: string;
  }>;
}) {
  const { slug } = await params;
  const queryParams = searchParams ? await searchParams : {};
  const tourMode = queryParams.tour === "1";
  const user = await getCurrentUser();
  const [t, interfaceLocale] = await Promise.all([getTranslations(), getInterfaceLocale()]);
  const copy = redesignCopy[interfaceLocale];
  const preferredLanguage = await getPreferredContentLanguage();
  const problem = await prisma.problem.findUnique({
    where: { slug },
    include: {
      author: true,
      domains: { orderBy: { position: "asc" } },
      spoilerTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      hints: { orderBy: [{ position: "asc" }, { id: "asc" }] },
      thread: {
        include: {
          posts: {
            where: { deletedAt: null },
            select: { id: true },
            orderBy: { createdAt: "asc" }
          }
        }
      },
      proofs: {
        include: {
          author: true,
          translatedBy: true,
          _count: { select: { comments: true } }
        },
        orderBy: { createdAt: "asc" }
      },
      relatedGroups: {
        include: {
          relations: {
            include: { targetProblem: { include: { author: true } } },
            orderBy: { position: "asc" }
          }
        },
        orderBy: { position: "asc" }
      },
      translatedFromProblem: {
        select: { id: true, slug: true, title: true, language: true, authorId: true }
      }
    }
  });

  if (!problem) notFound();
  const translationCreator = problem.translatedFromProblemId
    ? await prisma.pageRevision.findFirst({
        where: { pageType: "PROBLEM", pageId: problem.id, isCreation: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { editedBy: true }
      })
    : null;
  const isOwnProblem = user?.id === problem.authorId;
  const canViewArchived = canViewArchivedProblem(user, problem);
  if (problem.status === "ARCHIVED" && !canViewArchived) notFound();
  if (!canViewProblem(user, problem)) notFound();
  const hasSpecifiedOrigin =
    !isUnknownProblemOrigin(problem.origin) ||
    Boolean(problem.originChapter || problem.originPage || problem.originNote);

  const proofIds = problem.proofs.map((proof) => proof.id);
  const relatedProblems = problem.relatedGroups.flatMap((group) =>
    group.relations.map((relation) => relation.targetProblem)
  ).filter((targetProblem) => canViewProblem(user, targetProblem));
  const relatedProblemLinkBySlug = await resolveProblemLinksForLanguage(
    relatedProblems.map((relatedProblem) => relatedProblem.slug),
    problem.language,
    { status: { not: "ARCHIVED" }, ...visibleProblemWhere(user) }
  );
  const hasRelatedProblems = problem.relatedGroups.some((group) => group.relations.length > 0);
  const proofVoteGroupsPromise = proofIds.length
    ? prisma.vote.groupBy({
        by: ["targetId"],
        where: { targetType: "PROOF", targetId: { in: proofIds } },
        _count: { targetId: true }
      })
    : Promise.resolve([]);
  const proofReportsPromise = proofIds.length
    ? prisma.report.findMany({
        where: {
          targetType: TargetType.PROOF,
          targetId: { in: proofIds },
          status: ReportStatus.OPEN
        },
        select: {
          id: true,
          targetId: true,
          reporterId: true,
          category: true,
          reason: true,
          reporter: { select: { role: true } }
        }
      })
    : Promise.resolve([]);
  const [
    translations,
    familyHints,
    links,
    attemptsInTranslationGroup,
    receivedChallenge,
    playlists,
    ownVerificationRequests,
    pendingVerificationRequests,
    proofVoteGroups,
    proofReports,
    userVotes,
    favorite,
    groupFavoriteRows,
    relatedSolvedAttempts,
    ownReaction,
    groupSolvers
  ] = await Promise.all([
    prisma.problem.findMany({
      where: {
        translationGroupId: problem.translationGroupId,
        id: { not: problem.id },
        ...visibleProblemWhere(user),
        ...(canViewArchived ? {} : { status: { not: "ARCHIVED" } })
      },
      select: { slug: true, title: true, language: true, translatedFromProblemId: true },
      orderBy: { language: "asc" }
    }),
    prisma.problemHint.findMany({
      where: {
        problem: { translationGroupId: problem.translationGroupId }
      },
      select: {
        id: true,
        translationGroupId: true,
        translatedFromHintId: true,
        problemId: true,
        proofId: true,
        position: true,
        bodyMarkdown: true,
        bodyHtml: true,
        translatedBy: {
          select: { username: true, displayName: true }
        },
        problem: {
          select: {
            language: true,
            translatedFromProblemId: true
          }
        }
      },
      orderBy: [{ position: "asc" }, { id: "asc" }]
    }),
    prisma.internalLink.findMany({
      where: { sourceType: "PROBLEM", sourceId: problem.id },
      orderBy: { targetSlug: "asc" }
    }),
    user
      ? prisma.problemAttempt.findMany({
          where: { userId: user.id, problem: { translationGroupId: problem.translationGroupId } },
          orderBy: { discussionUnlockAt: "asc" }
        })
      : Promise.resolve([]),
    user
      ? prisma.problemChallenge.findFirst({
          where: {
            recipientId: user.id,
            problem: { translationGroupId: problem.translationGroupId }
          },
          orderBy: { createdAt: "desc" },
          select: {
            challenger: {
              select: {
                username: true,
                displayName: true
              }
            }
          }
        })
      : null,
    EXPLORATIONS_ENABLED
      ? prisma.playlistItem.findMany({
          where: { problemId: problem.id },
          include: { playlist: true },
          take: 6
        })
      : Promise.resolve([]),
    user
      ? prisma.problemVerificationRequest.findMany({
          where: { problemId: problem.id, userId: user.id },
          include: {
            messages: {
              include: { author: { select: { username: true, displayName: true } } },
              orderBy: { createdAt: "asc" }
            }
          },
          orderBy: { createdAt: "desc" },
          take: 3
        })
      : Promise.resolve([]),
    user?.id === problem.authorId
      ? prisma.problemVerificationRequest.findMany({
          where: { problemId: problem.id, status: "PENDING" },
          include: {
            user: {
              select: { username: true, displayName: true, avatarUrl: true, avatarBackground: true }
            },
            messages: {
              include: { author: { select: { username: true, displayName: true } } },
              orderBy: { createdAt: "asc" }
            }
          },
          orderBy: { createdAt: "asc" }
        })
      : Promise.resolve([]),
    proofVoteGroupsPromise,
    proofReportsPromise,
    user && proofIds.length
      ? prisma.vote.findMany({
          where: {
            userId: user.id,
            targetType: TargetType.PROOF,
            targetId: { in: proofIds }
          },
          select: { targetType: true, targetId: true }
        })
      : Promise.resolve([]),
    user && !isOwnProblem
      ? prisma.problemFavorite.findFirst({
          where: { userId: user.id, problem: { translationGroupId: problem.translationGroupId } }
        })
      : null,
    prisma.problemFavorite.findMany({
      where: {
        userId: { not: problem.authorId },
        problem: { translationGroupId: problem.translationGroupId }
      },
      distinct: ["userId"],
      select: {
        userId: true,
        user: {
          select: {
            username: true,
            profileSlug: true,
            displayName: true,
            avatarUrl: true,
            avatarBackground: true
          }
        }
      }
    }),
    user && relatedProblems.length
      ? prisma.problemAttempt.findMany({
          where: {
            userId: user.id,
            status: "SOLVED",
            problem: {
              translationGroupId: { in: relatedProblems.map((relatedProblem) => relatedProblem.translationGroupId) }
            }
          },
          select: { problem: { select: { translationGroupId: true } } }
        })
      : Promise.resolve([]),
    user && !isOwnProblem
      ? prisma.problemReaction.findUnique({
          where: { userId_problemId: { userId: user.id, problemId: problem.id } },
          select: { difficultyReaction: true, preferenceReaction: true }
        })
      : null,
    prisma.problemAttempt.findMany({
      where: {
        status: "SOLVED",
        ...(user ? { userId: { not: user.id } } : {}),
        problem: { translationGroupId: problem.translationGroupId }
      },
      distinct: ["userId"],
      orderBy: { updatedAt: "desc" },
      select: {
        user: {
          select: {
            id: true,
            username: true,
            profileSlug: true,
            displayName: true,
            avatarUrl: true,
            avatarBackground: true
          }
        }
      }
    })
  ]);
  const attempt =
    attemptsInTranslationGroup.find((translationAttempt) => translationAttempt.status === "SOLVED") ??
    attemptsInTranslationGroup[0] ??
    null;
  const solvedAt = problemSolvedAt(attemptsInTranslationGroup);
  const favoriteCount = groupFavoriteRows.length;
  const requestedLanguage = requestedTranslationLanguage(queryParams.viewLanguage);
  const targetViewLanguage = requestedLanguage ?? preferredLanguage;
  const selectedTranslation = selectContentTranslation(
    [
      {
        slug: problem.slug,
        language: problem.language,
        isSource: problem.translatedFromProblemId === null
      },
      ...translations.map((translation) => ({
        ...translation,
        isSource: translation.translatedFromProblemId === null
      }))
    ],
    targetViewLanguage
  );
  if (selectedTranslation?.slug && selectedTranslation.slug !== problem.slug) {
    const viewLanguageQuery = requestedLanguage
      ? `?${TRANSLATION_VIEW_LANGUAGE_PARAM}=${encodeURIComponent(requestedLanguage)}`
      : "";
    redirect(`/problems/${selectedTranslation.slug}${viewLanguageQuery}`);
  }
  const [
    renderedProblemContent,
    translationFreshness,
    linkedConceptLinkBySlug,
    linkedConceptTitleBySlug
  ] = await Promise.all([
    renderMarkdownCollectionForContentLanguage(
      [problem.bodyMarkdown, ...problem.proofs.map((proof) => proof.bodyMarkdown)],
      problem.language
    ),
    problemTranslationFreshness(problem.translatedFromProblem, problem.translatedFromRevisionId),
    resolveConceptLinksForLanguage(
      links.filter((link) => link.exists).map((link) => link.targetSlug),
      problem.language
    ),
    resolveConceptTitlesForLanguage(
      links.filter((link) => link.exists).map((link) => link.targetSlug),
      problem.language
    )
  ]);
  const [problemBodyHtml, ...proofBodyHtml] = renderedProblemContent;
  const proofBodyHtmlById = new Map(
    problem.proofs.map((proof, index) => [proof.id, proofBodyHtml[index] ?? proof.bodyHtml])
  );
  const isLanguageFallback = targetViewLanguage !== problem.language;

  const proofVotes = new Map(proofVoteGroups.map((item) => [item.targetId, item._count.targetId]));
  const ownProofVoteIds = new Set(userVotes.filter((vote) => vote.targetType === TargetType.PROOF).map((vote) => vote.targetId));
  const proofReportsByProofId = new Map<number, typeof proofReports>();
  for (const report of proofReports) {
    const reports = proofReportsByProofId.get(report.targetId) ?? [];
    reports.push(report);
    proofReportsByProofId.set(report.targetId, reports);
  }
  const relatedSolvedGroupIds = new Set(
    relatedSolvedAttempts.map((attempt) => attempt.problem.translationGroupId)
  );
  const proofs = [...problem.proofs].sort(
    (a, b) => (proofVotes.get(b.id) ?? 0) - (proofVotes.get(a.id) ?? 0) || a.createdAt.getTime() - b.createdAt.getTime()
  );
  const ownProofResetSignal = user ? problem.proofs.filter((proof) => proof.authorId === user.id).at(-1)?.id ?? 0 : 0;
  const ownProofForHint = user ? problem.proofs.filter((proof) => proof.authorId === user.id).at(-1) ?? null : null;
  const showOwnerSolvedBanner = shouldShowOwnerSolvedBanner({
    hasAnyProof: problem.proofs.length > 0,
    hasOwnProof: Boolean(ownProofForHint),
    hasRelatedProblems,
    isExercise: problem.isExercise
  });
  const ownSolutionHint = ownProofForHint
    ? problem.hints.find((hint) => hint.proofId === ownProofForHint.id) ?? null
    : null;
  const selectedHints = selectProblemHintsForLanguage(
    familyHints.map((hint) => ({
      id: hint.id,
      translationGroupId: hint.translationGroupId,
      translatedFromHintId: hint.translatedFromHintId,
      problemId: hint.problemId,
      proofId: hint.proofId,
      position: hint.position,
      bodyMarkdown: hint.bodyMarkdown,
      bodyHtml: hint.bodyHtml,
      language: hint.problem.language,
      translatedFromProblemId: hint.problem.translatedFromProblemId,
      translatedBy: hint.translatedBy
    })),
    problem.id
  );
  const requestedSourceHintId = Number(queryParams.translateHint);
  const translationSourceHint = Number.isInteger(requestedSourceHintId)
    ? selectedHints.find(
        (hint) => hint.id === requestedSourceHintId && hint.isLanguageFallback
      ) ?? null
    : null;
  const acceptedProofId =
    proofs.length > 0 && (proofVotes.get(proofs[0].id) ?? 0) >= COMMUNITY_ACCEPTED_PROOF_VOTES ? proofs[0].id : null;
  const isConjecture = problem.isConjecture;
  const visibleRelatedGroups = problem.relatedGroups
    .map((group) => ({
      ...group,
      relations: group.relations.filter(
        (relation) => relation.targetProblem.status !== "ARCHIVED" && canViewProblem(user, relation.targetProblem)
      )
    }))
    .filter((group) => group.relations.length > 0);
  const isProblemAuthor = Boolean(user && problem.authorId === user.id);
  const canEditCurrentProblem = Boolean(user && canEditProblem(user, problem));
  const canProposeCurrentProblem = Boolean(user && canProposeProblemEdit(user));
  const publishesProblemEdits = user
    ? await canPublishProblemEditForProblem(user, problem)
    : false;
  const canManageProblemHints = publishesProblemEdits;
  const requiresSolutionVerification = problem.verificationMode !== ProblemVerificationMode.NONE;
  const canViewSolutions = canViewProblemSolutions({
    requiresVerification: requiresSolutionVerification,
    hasSolvedAttempt: attempt?.status === "SOLVED",
    canEditProblem: canEditCurrentProblem
  });
  const problemSignInHref = `/login?returnTo=${encodeURIComponent(`/problems/${problem.slug}`)}`;
  const discussionPostCount = problem.thread?.posts.length ?? 0;
  const showVerificationRail = Boolean(
    (user &&
      attempt?.status !== "SOLVED" &&
      problem.verificationMode !== ProblemVerificationMode.NONE &&
      user.id !== problem.authorId) ||
    (ownVerificationRequests.length > 0 && attempt?.status !== "SOLVED")
  );
  const revealSpoilerDetails = attempt?.status === "SOLVED" || isProblemAuthor;
  const showSpoilerTags = problem.spoilerTags.length > 0 && revealSpoilerDetails;
  const problemDomains = problem.domains.length
    ? problem.domains.filter((item) => revealSpoilerDetails || !item.spoiler).map((item) => item.mscCode)
    : [problem.domain];
  const hiddenDomainCount = revealSpoilerDetails ? 0 : problem.domains.filter((item) => item.spoiler).length;
  const targetTranslationLanguage = nextMissingTranslationLanguage(problem.language, translations, targetViewLanguage);
  const addTranslationHref = targetTranslationLanguage
    ? `/problems/${problem.slug}/translate?language=${targetTranslationLanguage}`
    : undefined;
  const canManageTranslationFreshness = Boolean(
    user &&
      translationFreshness?.stale &&
      problem.translatedFromProblem &&
      (problem.translatedFromProblem.authorId === user.id || canUseAdminTools(user))
  );
  const verificationMessage =
    queryParams.verification === "incorrect" ? t.problemDetail.verificationIncorrect : null;
  const heroDomain = problemDomains[0] ?? (problem.domains.length ? "other" : problem.domain);
  const problemTitleHtml = await renderInlineMarkdown(problem.title);
  const [domainProblemGroups, domainSolvedGroups, nextRecommendationData] = attempt?.status === "SOLVED" && user
    ? await Promise.all([
        prisma.problem.findMany({
          where: { status: "PUBLISHED", listed: true, domain: problem.domain },
          distinct: ["translationGroupId"],
          select: { translationGroupId: true }
        }),
        prisma.problemAttempt.findMany({
          where: { userId: user.id, status: "SOLVED", problem: { domain: problem.domain } },
          distinct: ["problemId"],
          select: { problem: { select: { translationGroupId: true } } }
        }),
        recommendationsForUser(user.id, 8, interfaceLocale)
      ])
    : [[], [], null];
  const domainSolvedCount = new Set(domainSolvedGroups.map((item) => item.problem.translationGroupId)).size;
  const nextProblem = nextRecommendationData?.recommendations.find(
    (item) => item.problem.translationGroupId !== problem.translationGroupId
  )?.problem ?? null;
  return (
    <div className="problem-detail-shell">
      <GuestContentViewGate
        contentKey={`problem:${problem.translationGroupId}`}
        redirectingLabel={t.guestContentGate.redirecting}
        signedIn={Boolean(user)}
      />
      {user && queryParams.recommended === "1" && !tourMode && !isOwnProblem && attempt?.status !== "SOLVED" && (
        <ProblemRecommendationExposure problemId={problem.id} />
      )}
      <section className="problem-hero">
        <img src="/art/hero-rye.jpg" alt="Ivan Shishkin, Rye (1878)" />
        <div className="problem-hero-overlay" />
      </section>

      <div className="problem-detail-body">
        <div className="problem-detail-preamble">
        <header className="problem-title-block">
          <p className="problem-breadcrumb">
            <Link href="/problems">{t.problems.title}</Link>
            <span>/</span>
            <Link href={`/problems?domain=${encodeURIComponent(heroDomain)}`}>
              {translatedDomainLabel(heroDomain, t.home.domainLabels)}
            </Link>
            {problem.isExercise && (
              <span className="problem-type-badge">
                {t.problems.exerciseBadge}
              </span>
            )}
            <span className={`problem-review-badge problem-review-${problem.qualityStatus.toLowerCase()}`}>
              {t.quality[problem.qualityStatus]}
            </span>
            {problem.needsReviewAfterEdit && (
              <span className="problem-review-badge problem-review-edited">
                {t.problems.editedSinceReview}
              </span>
            )}
          </p>
          <h1 id="problem-title"><AsyncMarkdownInline markdown={problem.title} /></h1>
          <div className="problem-title-meta">
            <Link href={`/profile/${problem.author.profileSlug}`}>
              {t.problemDetail.by} <UserName user={problem.author} />
            </Link>
            {translationCreator?.editedBy && translationCreator.editedBy.id !== problem.authorId && (
              <>
                <span>·</span>
                <Link href={`/profile/${translationCreator.editedBy.profileSlug}`}>
                  {t.translations.translatedBy} <UserName user={translationCreator.editedBy} />
                </Link>
              </>
            )}
            <span>·</span>
            <Difficulty value={problem.difficulty} compact />
            <span>·</span>
            <ContentTranslations
              currentLanguage={problem.language}
              hrefPrefix="/problems"
              translations={translations}
              addTranslationLabel={t.translations.addTranslation}
              createHref={addTranslationHref}
            />
          </div>
        </header>
        {attempt?.status === "SOLVED" && (!isOwnProblem || showOwnerSolvedBanner) && (
          <section className={`problem-solved-banner${isOwnProblem ? " problem-solved-banner-owner" : ""}`} role="status">
            <span className="problem-solved-check"><Check size={20} /></span>
            <div className="problem-solved-copy">
              <strong>
                {isOwnProblem
                  ? ownProofForHint
                    ? problem.isExercise
                      ? copy.ownerSolved.exerciseProgression
                      : copy.ownerSolved.addRelated
                    : copy.ownerSolved.writeSolution
                  : copy.solvedProgress(
                      domainSolvedCount,
                      domainProblemGroups.length,
                      translatedDomainLabel(heroDomain, t.home.domainLabels)
                    )}
              </strong>
              {isOwnProblem ? (
                ownProofForHint ? (
                  problem.isExercise ? null : (
                    <>
                      {" "}
                      <Link className="problem-solved-next-action" href={`/problems/${problem.slug}/edit#related-problems-editor`}>
                        {copy.ownerSolved.addRelatedAction}
                      </Link>
                    </>
                  )
                ) : (
                  <>
                    {" "}
                    <a className="problem-solved-next-action" href="#write-solution">
                      {copy.ownerSolved.writeSolutionAction}
                    </a>
                  </>
                )
              ) : groupSolvers.length > 0 && (
                <p>
                  <span className="problem-solver-avatars">
                    {groupSolvers.map(({ user: solver }) => (
                      <UserAvatar key={solver.id} user={solver} size="sm" />
                    ))}
                  </span>
                  <span className="problem-solver-names">
                    {groupSolvers.map(({ user: solver }) => displayNameForUser(solver)).join(", ")} {copy.solvedToo}
                  </span>
                </p>
              )}
            </div>
            {!isOwnProblem && (
              <ProblemReactions
                labels={copy.reactions}
                problemId={problem.id}
                problemSlug={problem.slug}
                reaction={ownReaction}
              />
            )}
          </section>
        )}
        {queryParams.challenge === "accepted" && (
          <p className="quality-banner challenge-accepted-banner mb-4" role="status">
            {t.social.challengeLink.accepted}
          </p>
        )}
        {verificationMessage && (
          <p className="quality-banner quality-needs-work mb-4" role="status">
            {verificationMessage}
          </p>
        )}
        {queryParams.editProposal === "submitted" && (
          <p className="quality-banner quality-unreviewed mb-4" role="status">
            Your proposed changes were sent to the admins. The public problem has not changed yet.
          </p>
        )}
        {queryParams.editProposal === "unchanged" && (
          <p className="quality-banner quality-unreviewed mb-4" role="status">
            No changes were submitted.
          </p>
        )}

          {isLanguageFallback && (
            <p className="quality-banner quality-unreviewed mb-4 text-sm">
              {t.translations.fallbackNotice(contentLanguageLabel(problem.language), contentLanguageLabel(targetViewLanguage))}
              {addTranslationHref && (
                <>
                  {" "}
                  <Link href={addTranslationHref as never} className="underline">
                    {t.translations.addThatTranslation}
                  </Link>
                  .
                </>
              )}
            </p>
          )}
          {translationFreshness?.stale && (
            <div className="quality-banner quality-needs-work translation-stale-banner mb-4 text-sm">
              <span>{t.translations.staleNotice(translationFreshness.basedOnRevisionId)}</span>
              {canManageTranslationFreshness && (
                <>
                  <Link href={translationFreshness.sourceHref as never} className="underline">
                    {t.translations.compareWith(translationFreshness.sourceTitle)}
                  </Link>
                  <form action={dismissProblemTranslationStaleNoticeAction.bind(null, problem.id)}>
                    <button type="submit" className="secondary translation-stale-dismiss">
                      {t.translations.dismiss}
                    </button>
                  </form>
                </>
              )}
            </div>
          )}
          {problem.styles.length > 0 && (
            <div className="problem-detail-tags zen-meta">
              {problem.styles.map((style) => (
                <Link
                  key={style}
                  href={`/problems?filterField=style&filterOp=is&filterValue=${style}`}
                  className="tag"
                >
                  {problemStyleLabel(style, interfaceLocale)}
                </Link>
              ))}
            </div>
          )}
          {showSpoilerTags && (
            <div className="problem-detail-tags zen-meta">
              <span className="meta">{t.problems.spoiler}</span>
              {problem.spoilerTags.map(({ tag }) => (
                <Link
                  key={tag.id}
                  href={`/problems?tag=${tag.slug}&includeSpoilerTags=1`}
                  className="tag spoiler-tag"
                >
                  {tag.name}
                </Link>
              ))}
            </div>
          )}

        {(problem.qualityStatus === "UNREVIEWED" ||
          problem.qualityStatus === "NEEDS_WORK" ||
          problem.needsReviewAfterEdit) && (
          <div
            className={
              problem.qualityStatus === "NEEDS_WORK"
                ? "zen-hide quality-banner quality-banner-compact quality-needs-work mb-4"
                : "zen-hide quality-banner quality-banner-compact quality-unreviewed mb-4"
            }
          >
            <strong>{t.quality[problem.qualityStatus]}.</strong>{" "}
            {problem.needsReviewAfterEdit
              ? t.problems.editedSinceReviewNotice
              : problem.qualityStatus === "NEEDS_WORK"
                ? t.problemDetail.needsWorkNotice
                : t.problemDetail.unreviewedNotice}
            {user && canReviewProblem(user, problem) && (
              <form action={markProblemReviewedAction.bind(null, problem.id, problem.slug)} className="mt-2">
                <button type="submit" className="secondary">
                  {t.problemDetail.markReviewed}
                </button>
              </form>
            )}
          </div>
        )}

        </div>

        <article className="problem-detail-article" aria-labelledby="problem-title">

        <section className="problem-statement reading-surface" data-tour-target="statement">
          <MarkdownBlock html={problemBodyHtml} />
        </section>
        <section
          className={`problem-primary-actions${isConjecture ? " conjecture" : ""}`}
          aria-label="Problem progress"
        >
          {!isConjecture && (user ? (
            attempt?.status === "SOLVED" ? (
              <form action={unmarkProblemSolvedAction.bind(null, problem.id, problem.slug)}>
                <button type="submit" className="problem-action-tile solved" title={t.problemDetail.unmarkSolved}>
                  <Check size={25} />
                  <span>
                    <strong>{t.problemDetail.solved}</strong>
                    {solvedAt && (
                      <small>
                        <time dateTime={solvedAt.toISOString()} title={solvedAt.toLocaleString(interfaceLocale)}>
                          {formatProblemSolvedDate(solvedAt, interfaceLocale)}
                        </time>
                      </small>
                    )}
                  </span>
                </button>
              </form>
            ) : problem.verificationMode === ProblemVerificationMode.NONE || user.id === problem.authorId ? (
              <form action={markProblemSolvedAction.bind(null, problem.id, problem.slug)}>
                <button type="submit" className="problem-action-tile solve">
                  <Check size={25} />
                  <span><strong>{t.problemDetail.markSolved}</strong><small>{copy.tiles.solveSub}</small></span>
                </button>
              </form>
            ) : (
              <a href="#problem-verification" className="problem-action-tile solve">
                <Check size={25} />
                <span><strong>{t.problemDetail.markSolved}</strong><small>{copy.tiles.verifySub}</small></span>
              </a>
            )
          ) : (
            <Link href={problemSignInHref as never} className="problem-action-tile solve">
              <Check size={25} />
              <span><strong>{t.problemDetail.markSolved}</strong><small>{copy.tiles.solveSub}</small></span>
            </Link>
          ))}
          {user ? (
            attempt ? (
              <span className="problem-action-tile attempted" aria-disabled="true">
                <Target size={25} />
                <span><strong>{t.problemDetail.attempted}</strong><small>{copy.tiles.attemptedSub}</small></span>
              </span>
            ) : (
              <form action={startAttemptAction.bind(null, problem.id, problem.slug)}>
                <button type="submit" className="problem-action-tile attempted">
                  <Target size={25} />
                  <span><strong>{receivedChallenge ? t.problemDetail.challenged : t.problemDetail.startAttempting}</strong><small>{copy.tiles.attemptSub}</small></span>
                </button>
              </form>
            )
          ) : (
            <Link href={problemSignInHref as never} className="problem-action-tile attempted">
              <Target size={25} />
              <span><strong>{t.problemDetail.startAttempting}</strong><small>{copy.tiles.attemptSub}</small></span>
            </Link>
          )}
          <div className={`problem-favorite-control${favoriteCount > 0 ? " has-users" : ""}`}>
            {isOwnProblem ? (
              <span className="problem-action-tile problem-favorite-main favorite">
                <Heart size={25} />
                <span><strong>{t.problemDetail.yourProblem}</strong><small>{copy.tiles.favoriteSub(favoriteCount)}</small></span>
              </span>
            ) : user ? (
              <form action={toggleProblemFavoriteAction.bind(null, problem.id, problem.slug)}>
                <button type="submit" className="problem-action-tile problem-favorite-main favorite" aria-pressed={Boolean(favorite)}>
                  <Heart size={25} fill={favorite ? "currentColor" : "none"} />
                  <span><strong>{favorite ? t.problemDetail.favorited : t.problemDetail.addFavorite}</strong><small>{copy.tiles.favoriteSub(favoriteCount)}</small></span>
                </button>
              </form>
            ) : (
              <Link href={problemSignInHref as never} className="problem-action-tile problem-favorite-main favorite">
                <Heart size={25} />
                <span><strong>{t.problemDetail.addFavorite}</strong><small>{copy.tiles.favoriteSub(favoriteCount)}</small></span>
              </Link>
            )}
            {favoriteCount > 0 && (
              <details className="problem-favorite-users">
                <summary title={copy.favoriteUsers.summary} aria-label={copy.favoriteUsers.summary}>
                  <Users size={18} aria-hidden="true" />
                </summary>
                <div className="problem-favorite-users-panel">
                  <h2>{copy.favoriteUsers.title}</h2>
                  <ul>
                    {groupFavoriteRows.map(({ user: favoriteUser }) => (
                      <li key={favoriteUser.username}>
                        <Link href={`/profile/${favoriteUser.profileSlug}`}>
                          <UserName user={favoriteUser} />
                          <span className="problem-favorite-username">@{favoriteUser.profileSlug}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            )}
          </div>
        </section>
        {hasSpecifiedOrigin && (
          <div className="problem-origin-note zen-meta">
            {!isUnknownProblemOrigin(problem.origin) && <span>{t.problemDetail.origin} {problem.origin}</span>}
            {(problem.originChapter || problem.originPage || problem.originNote) && (
              <details>
                <summary>{t.problemDetail.details}</summary>
                <div className="grid gap-1 pt-2">
                  {problem.originChapter && <p>{t.problemDetail.chapterOrSection} {problem.originChapter}</p>}
                  {problem.originPage && <p>{t.problemDetail.pageOrProblemNumber} {problem.originPage}</p>}
                  {problem.originNote && <p className="whitespace-pre-wrap">{problem.originNote}</p>}
                </div>
              </details>
            )}
          </div>
        )}

        {problem.showRelatedProblems && (
          <section className="zen-hide related-problems-section mt-8">
            <details>
              <summary>
                <span>{t.problemDetail.showRelatedProblems}</span>
                <span>{visibleRelatedGroups.reduce((count, group) => count + group.relations.length, 0)}</span>
              </summary>
              <div className="grid gap-5 pt-4">
                {visibleRelatedGroups.length > 0 ? (
                  visibleRelatedGroups.map((group) => (
                    <div key={group.id} className="related-problem-group">
                      <h2>{group.title}</h2>
                      <div className="grid gap-2">
                        {group.relations.map(({ id, targetProblem }) => {
                          const resolvedProblem = relatedProblemLinkBySlug.get(targetProblem.slug);
                          return <Link
                            key={id}
                            href={(resolvedProblem?.href ?? `/problems/${targetProblem.slug}`) as never}
                            className={problemLinkClass(
                              "related-problem-link block",
                              relatedSolvedGroupIds.has(targetProblem.translationGroupId)
                            )}
                          >
                            <Difficulty compact value={resolvedProblem?.difficulty ?? targetProblem.difficulty} />
                            <span className="related-problem-copy">
                              <strong>
                                <AsyncMarkdownInline markdown={resolvedProblem?.title ?? targetProblem.title} />
                                <ContentLanguageFallback language={resolvedProblem?.language ?? targetProblem.language} expectedLanguage={problem.language} />
                              </strong>
                              <span>
                                {t.problemDetail.by} <UserName user={targetProblem.author} />
                                {!targetProblem.listed ? ` \u00b7 ${t.problemDetail.playlistSpecific.toLowerCase()}` : ""}
                              </span>
                            </span>
                          </Link>;
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted">{t.problemDetail.noRelatedProblems}</p>
                )}
                {canEditCurrentProblem && (
                  <div className="related-problem-actions">
                    <Link href={`/problems/new?parent=${problem.slug}&listed=0&language=${problem.language}`} className="button">
                      {t.problemDetail.createSpecificProblem}
                    </Link>
                    <Link href={`/problems/${problem.slug}/edit`} className="button secondary">
                      {t.problemDetail.editRelatedProblems}
                    </Link>
                  </div>
                )}
              </div>
            </details>
          </section>
        )}

        {(selectedHints.length > 0 || canManageProblemHints) && (
          <section id="problem-hints" className="zen-hide problem-hints-section mt-8">
            <div className="section-heading">
              <h2>{t.problemDetail.hints}</h2>
              <span>{selectedHints.length}</span>
            </div>
            {queryParams.hint === "created" && (
              <p className="success-text">{t.problemDetail.hintCreated}</p>
            )}
            {selectedHints.length > 0 && (
              <ProblemHints
                hints={selectedHints.map((hint, index) => ({
                  id: hint.id,
                  html: hint.bodyHtml,
                  label: t.problemDetail.hint(index + 1),
                  fallbackLabel: hint.isLanguageFallback
                    ? t.problemDetail.hintLanguageFallback(contentLanguageLabel(hint.language))
                    : null,
                  translatorLabel: hint.translatedBy
                    ? `${t.translations.translatedBy} ${displayNameForUser(hint.translatedBy)}`
                    : null,
                  translateHref:
                    canManageProblemHints && hint.isLanguageFallback
                      ? `/problems/${problem.slug}?${TRANSLATION_VIEW_LANGUAGE_PARAM}=${encodeURIComponent(
                          problem.language
                        )}&translateHint=${hint.id}#add-problem-hint`
                      : null
                }))}
                labels={{
                  showFirst: t.problemDetail.showHint,
                  showNext: t.problemDetail.showNextHint,
                  guidance: t.problemDetail.hintRevealGuidance,
                  translate: t.problemDetail.translateHint
                }}
              />
            )}
            {canManageProblemHints && (
              <details
                id="add-problem-hint"
                className="problem-hint-composer"
                open={Boolean(translationSourceHint)}
              >
                <summary>
                  <Lightbulb size={17} aria-hidden="true" />
                  {translationSourceHint
                    ? t.problemDetail.translateHint
                    : t.problemDetail.addProblemHint}
                </summary>
                <div className="problem-hint-composer-body">
                  <p>{t.problemDetail.problemHintDescription}</p>
                  <form
                    action={createProblemHintFromProblemAction.bind(null, problem.id)}
                    className="grid gap-3"
                  >
                    {translationSourceHint && (
                      <input
                        type="hidden"
                        name="sourceHintId"
                        value={translationSourceHint.id}
                      />
                    )}
                    <MarkdownEditor
                      name="bodyMarkdown"
                      initialValue={translationSourceHint?.bodyMarkdown}
                      minHeight="8rem"
                      lineNumbers={false}
                      draftKey={
                        translationSourceHint
                          ? `problem:${problem.id}:translate-hint:${translationSourceHint.id}`
                          : `problem:${problem.id}:new-hint`
                      }
                      resetSignal={selectedHints.length}
                    />
                    <button type="submit">
                      {translationSourceHint
                        ? t.problemDetail.saveHintTranslation
                        : t.problemDetail.saveProblemHint}
                    </button>
                  </form>
                </div>
              </details>
            )}
          </section>
        )}

        <section id="problem-solutions" className="zen-hide proof-section mt-8" data-tour-target="help">
          <div className="section-heading">
            <h2>{t.problemDetail.solutions}</h2>
            <span>{proofs.length}</span>
          </div>
          {isConjecture && proofs.length === 0 && (
            <p className="quality-banner quality-stub">{t.problemDetail.conjectureNoSolution}</p>
          )}
          {proofs.length > 0 && !canViewSolutions && (
            <p className="quality-banner quality-unreviewed">
              {t.problemDetail.solutionsHiddenUntilVerified}
            </p>
          )}
          {proofs.length > 0 && canViewSolutions && (
            <details className="proof-reveal-gate">
              <summary>
                <span>{t.problemDetail.revealSolutions}</span>
                <small>{t.problemDetail.revealWarning}</small>
              </summary>
              <div className="proof-list">
                {proofs.map((proof) => {
                  const votes = proofVotes.get(proof.id) ?? 0;
                  const userVotedProof = ownProofVoteIds.has(proof.id);
                  const accepted = proof.id === acceptedProofId;
                  const canEditProof = Boolean(user && canEditSolution(user, proof));
                  const isOwnProof = user?.id === proof.authorId || user?.id === proof.translatedById;
                  const openProofReports = proofReportsByProofId.get(proof.id) ?? [];
                  const ownOpenReport = user
                    ? openProofReports.find((report) => report.reporterId === user.id) ?? null
                    : null;
                  const showConcern =
                    solutionConcernIsPublic(openProofReports.map((report) => report.reporter.role)) ||
                    Boolean(isOwnProof) ||
                    Boolean(ownOpenReport) ||
                    Boolean(user && canUseModerationTools(user));
                  return (
                    <article id={`solution-${proof.id}`} key={proof.id} className={accepted ? "proof-card proof-accepted" : "proof-card"}>
                      <header className="proof-header">
                        <div>
                          {accepted && <span className="accepted-label">{t.problemDetail.communityAccepted}</span>}
                          {showConcern && openProofReports.length > 0 && (
                            <span className="solution-concern-label">
                              {ownOpenReport
                                ? t.problemDetail.yourSolutionReportPending
                                : t.problemDetail.solutionIssueReported}
                            </span>
                          )}
                          <p className="meta">
                            {t.problemDetail.solutionBy}{" "}
                            <Link href={`/profile/${proof.author.profileSlug}`}>
                              <UserName user={proof.author} />
                            </Link>
                            {proof.translatedBy && (
                              <>
                                {" · "}{t.translations.translatedBy}{" "}
                                <Link href={`/profile/${proof.translatedBy.profileSlug}`}>
                                  <UserName user={proof.translatedBy} />
                                </Link>
                              </>
                            )}
                          </p>
                        </div>
                        <div className="proof-actions">
                          <Link
                            href={`/problems/${problem.slug}/proofs/${proof.id}/discussion` as never}
                            className="proof-discussion-link"
                            title={t.problemDetail.openDiscussion}
                          >
                            <MessageCircle size={14} aria-hidden="true" />
                            <span>{t.problemDetail.discussions}</span>
                            {proof._count.comments > 0 && (
                              <span className="proof-discussion-count">{proof._count.comments}</span>
                            )}
                          </Link>
                          {canEditProof && (
                            <Link href={`/problems/${problem.slug}/proofs/${proof.id}/edit` as never} className="button secondary">
                              <Pencil size={16} />
                              {t.problemDetail.editSolution}
                            </Link>
                          )}
                          {user ? (
                            <form action={voteProofAction.bind(null, proof.id, problem.slug)}>
                              <button
                                type="submit"
                                className={userVotedProof ? "secondary vote-button-active" : "secondary"}
                                disabled={isOwnProof}
                                aria-pressed={userVotedProof}
                                title={
                                  isOwnProof
                                    ? t.problemDetail.cannotVoteOwnSolution
                                    : userVotedProof
                                      ? t.problemDetail.removeUsefulVote
                                      : t.problemDetail.markUseful
                                }
                              >
                                <ThumbsUp size={16} />
                                {votes}
                              </button>
                            </form>
                          ) : (
                            <span className="meta">{t.problemDetail.usefulVotes(votes)}</span>
                          )}
                        </div>
                      </header>
                      <MarkdownBlock html={proofBodyHtmlById.get(proof.id) ?? proof.bodyHtml} />
                    </article>
                  );
                })}
              </div>
            </details>
          )}
          {user && attempt?.status === "SOLVED" && ownProofForHint && (
            <details
              id="solution-hint"
              className="solution-hint-callout"
              open={queryParams.hint === "saved"}
            >
              <summary>
                <Lightbulb size={17} />
                <span>{ownSolutionHint ? t.problemDetail.editSolutionHint : t.problemDetail.addSolutionHint}</span>
              </summary>
              <div className="solution-hint-body">
                {queryParams.hint === "saved" && <p className="success-text">{t.problemDetail.solutionHintSaved}</p>}
                <p>{t.problemDetail.solutionHintDescription}</p>
                <form action={saveSolutionHintAction.bind(null, problem.id, ownProofForHint.id)} className="grid gap-3">
                  <MarkdownEditor
                    name="bodyMarkdown"
                    initialValue={ownSolutionHint?.bodyMarkdown}
                    minHeight="8rem"
                    lineNumbers={false}
                    draftKey={`problem:${problem.id}:proof:${ownProofForHint.id}:hint`}
                    resetSignal={ownSolutionHint?.updatedAt.getTime() ?? 0}
                  />
                  <button type="submit">{t.problemDetail.saveSolutionHint}</button>
                </form>
              </div>
            </details>
          )}
          {user && (
            <details id="write-solution" className="add-proof">
              <summary>{proofs.length === 0 ? t.problemDetail.firstSolution : t.problemDetail.addAnotherSolution}</summary>
              <form action={createProofAction.bind(null, problem.id, problem.slug)} className="grid gap-3 pt-3">
                <MarkdownEditor
                  name="bodyMarkdown"
                  minHeight="12rem"
                  lineNumbers={false}
                  draftKey={`problem:${problem.id}:new-solution`}
                  resetSignal={ownProofResetSignal}
                />
                <button type="submit">{t.problemDetail.publishSolution}</button>
              </form>
            </details>
          )}
        </section>

        <section id="report" className="problem-report-section zen-hide">
          <details>
            <summary>{t.problemDetail.report}</summary>
            <form action={reportProblemAction.bind(null, problem.id)} className="mt-3 grid gap-2">
              <textarea
                name="reason"
                placeholder={t.problemDetail.reportPlaceholder}
                required
              />
              <button type="submit" className="secondary">
                {t.problemDetail.submit}
              </button>
            </form>
          </details>
        </section>

      </article>

        <aside className="problem-rail zen-hide">
        <nav className="problem-rail-actions" aria-label={t.problemDetail.problem}>
          {canProposeCurrentProblem && (
            <Link href={`/problems/${problem.slug}/edit`}>
              <span className="problem-rail-action-label">
                <Pencil size={16} aria-hidden="true" />
                <span>{publishesProblemEdits ? t.problemDetail.edit : "Propose an edit"}</span>
              </span>
            </Link>
          )}
          <Link href={`/problems/${problem.slug}/discussion`}>
            <span className="problem-rail-action-label">
              <MessageCircle size={16} aria-hidden="true" />
              <span>{t.problemDetail.discussions}</span>
            </span>
            <span className="problem-rail-action-count">{discussionPostCount}</span>
          </Link>
          <Link href={`/problems/${problem.slug}/history`}>
            <span className="problem-rail-action-label">
              <History size={16} aria-hidden="true" />
              <span>{t.conceptDetail.history}</span>
            </span>
          </Link>
          {user && problem.status === "PUBLISHED" && problem.listed && (
            <ProblemChallengeLauncher
              className="problem-rail-challenge-trigger"
              challengeLabels={t.social.challenge}
              linkLabels={{
                button: t.social.challengeLink.button,
                cancel: t.social.challengeLink.cancel,
                close: t.social.challengeLink.close,
                copied: t.social.challengeLink.copied,
                copy: t.social.challengeLink.copy,
                createAnother: t.social.challengeLink.createAnother,
                description: t.social.challengeLink.description,
                done: t.social.challengeLink.done,
                errors: t.social.challengeLink.errors,
                expiryNotice: t.social.challengeLink.expiryNotice,
                generate: t.social.challengeLink.generate,
                generating: t.social.challengeLink.generating,
                linkLabel: t.social.challengeLink.linkLabel,
                messagePlaceholder: t.social.challengeLink.messagePlaceholder,
                problem: t.social.challengeLink.problem,
                ready: t.social.challengeLink.ready,
                shareCopied: t.social.challengeLink.shareCopied,
                shareCopy: t.social.challengeLink.shareCopy,
                shareDescription: t.social.challengeLink.shareDescription,
                shareGenerate: t.social.challengeLink.shareGenerate,
                shareLinkLabel: t.social.challengeLink.shareLinkLabel,
                shareNative: t.social.challengeLink.shareNative,
                shareProblem: t.social.challengeLink.shareProblem,
                shareReady: t.social.challengeLink.shareReady,
                shareText: t.social.challengeLink.shareText,
                shareTitle: t.social.challengeLink.shareTitle,
                title: t.social.challengeLink.title
              }}
              problem={{
                difficulty: problem.difficulty,
                domainLabel: translatedDomainLabel(heroDomain, t.home.domainLabels),
                language: problem.language,
                listed: problem.listed,
                slug: problem.slug,
                title: problem.title,
                titleHtml: problemTitleHtml
              }}
            />
          )}
          <a href="#report">
            <span className="problem-rail-action-label">
              <Flag size={16} aria-hidden="true" />
              <span>{t.problemDetail.report}</span>
            </span>
          </a>
        </nav>

          {nextProblem && (
            <section className="problem-next-card">
              <span aria-hidden="true">⇉</span>
              <p>{copy.next}</p>
              <h2><AsyncMarkdownInline markdown={nextProblem.title} /></h2>
              <div>
                <Difficulty value={nextProblem.difficulty} compact />
                <small>{translatedDomainLabel(nextProblem.domains[0] ?? "OTHER", t.home.domainLabels)}</small>
              </div>
              <Link href={`/problems/${nextProblem.slug}?recommended=1`}>{copy.open}</Link>
            </section>
          )}

        {showVerificationRail && (
          <section className="action-surface" id="problem-verification">
            {user &&
              problem.verificationMode === ProblemVerificationMode.SELF_CHECK &&
              user.id !== problem.authorId && (
                <form action={markProblemSolvedAction.bind(null, problem.id, problem.slug)} className="verification-box">
                  <p className="font-medium">{t.problemDetail.verification}</p>
                  <p className="muted text-sm">
                    {problem.verificationPrompt || t.problemDetail.verificationPlaceholder}
                  </p>
                  <input name="verificationAnswer" required placeholder={t.problemDetail.shortAnswer} />
                  <button type="submit" className="secondary w-full">
                    <Check size={17} />
                    {t.problemDetail.checkAndMarkSolved}
                  </button>
                </form>
              )}
            {user &&
              problem.verificationMode === ProblemVerificationMode.AUTHOR_REVIEW &&
              user.id !== problem.authorId && (
                <form action={markProblemSolvedAction.bind(null, problem.id, problem.slug)} className="verification-box">
                  <p className="font-medium">{t.problemDetail.authorReview}</p>
                  <p className="muted text-sm">
                    {problem.verificationPrompt || t.problemDetail.authorReviewDescription}
                  </p>
                  <textarea name="verificationAnswer" required placeholder={t.problemDetail.explainAnswer} />
                  <button type="submit" className="secondary w-full">
                    {t.problemDetail.requestVerification}
                  </button>
                </form>
              )}
            {ownVerificationRequests.length > 0 && (
              <div className="verification-history">
                {ownVerificationRequests.map((request) => (
                  <Link
                    key={request.id}
                    href={`/problems/${problem.slug}/verification/${request.id}` as never}
                    className="verification-thread verification-thread-link"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>{t.problemDetail.reviewStatus(verificationStatusLabel(request.status))}</span>
                    <span>{request.messages.length ? t.problemDetail.messages(request.messages.length) : t.problemDetail.openDiscussion}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        {pendingVerificationRequests.length > 0 && (
          <section className="sidebar-section verification-review-list">
            <h2 className="mb-3 font-semibold">{t.problemDetail.pendingVerifications}</h2>
            <div className="grid gap-3">
              {pendingVerificationRequests.map((request) => (
                <div key={request.id} className="verification-review-card">
                  <p className="meta">
                    <UserName user={request.user} />
                  </p>
                  <div className="verification-submission">
                    <strong>{t.problemDetail.submittedAnswer}</strong>
                    <p>{request.answer}</p>
                  </div>
                  <Link
                    href={`/problems/${problem.slug}/verification/${request.id}` as never}
                    className="verification-thread verification-thread-link"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>{t.problemDetail.openDiscussion}</span>
                    <span>{request.messages.length ? t.problemDetail.messages(request.messages.length) : t.problemDetail.noMessagesYet}</span>
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {links.length > 0 && (
          <section className="sidebar-section">
            <h2 className="mb-3 font-semibold">{t.problemDetail.linkedConcepts}</h2>
            <div className="grid gap-2 text-sm">
              {links.map((link) => {
                const title = link.exists
                  ? (linkedConceptTitleBySlug.get(link.targetSlug) ?? titleFromConceptSlug(link.targetSlug))
                  : (link.label ?? titleFromConceptSlug(link.targetSlug));
                const resolvedLink = linkedConceptLinkBySlug.get(link.targetSlug);

                return (
                  <Link
                    key={link.id}
                    href={(link.exists ? (resolvedLink?.href ?? `/concepts/${link.targetSlug}`) : missingConceptHref(title)) as never}
                    className={link.exists ? "wiki-link" : "wiki-link missing"}
                  >
                    {title}
                    {link.exists && resolvedLink && <ContentLanguageFallback language={resolvedLink.language} expectedLanguage={problem.language} />}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {playlists.length > 0 && (
          <section className="sidebar-section">
            <h2 className="mb-3 font-semibold">{t.problemDetail.playlists}</h2>
            <div className="grid gap-2 text-sm">
              {playlists.map((item) => (
                <Link key={item.id} href={`/explorations/${item.playlist.slug}/start` as never} className="underline">
                  {item.playlist.title}
                </Link>
              ))}
            </div>
          </section>
        )}

      </aside>
      </div>
    </div>
  );
}
