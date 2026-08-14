import {
  automaticDailyProblemGroup,
  dailyProblemDefaultImageUrl,
  isDailyProblemDateKey
} from "@/lib/daily-problem-schedule";
import { prisma } from "@/lib/db";
import { tipImageObjectPosition } from "@/lib/tip-images";
import { selectContentTranslation } from "@/lib/translation-routing";

export async function loadDailyProblemPreview(dateKey: string, preferredLanguage: string) {
  if (!isDailyProblemDateKey(dateKey)) return null;

  const scheduled = await prisma.dailyProblemSchedule.findUnique({
    where: { dateKey },
    include: {
      problem: {
        select: {
          translationGroupId: true,
          status: true,
          listed: true,
          isExercise: true
        }
      }
    }
  });
  const scheduledGroup =
    scheduled?.problem.status === "PUBLISHED"
    && scheduled.problem.listed
    && !scheduled.problem.isExercise
      ? scheduled.problem.translationGroupId
      : null;

  const [candidates, previouslyFeatured] = scheduledGroup
    ? [[], []]
    : await Promise.all([
        prisma.problem.findMany({
          where: {
            status: "PUBLISHED",
            listed: true,
            isExercise: false,
            canAppearOnFrontPage: true,
            translatedFromProblemId: null
          },
          select: { translationGroupId: true }
        }),
        prisma.dailyProblemSchedule.findMany({
          where: { dateKey: { lt: dateKey } },
          select: { problem: { select: { translationGroupId: true } } }
        })
      ]);
  const chosenGroup = scheduledGroup
    ?? automaticDailyProblemGroup(
      candidates,
      dateKey,
      previouslyFeatured.map((entry) => entry.problem.translationGroupId)
    );
  const translations = chosenGroup
    ? await prisma.problem.findMany({
        where: { translationGroupId: chosenGroup, status: "PUBLISHED", listed: true },
        include: { author: true }
      })
    : [];
  const fallbackSource = translations.length === 0
    ? await prisma.problem.findFirst({
        where: {
          status: "PUBLISHED",
          listed: true,
          isExercise: false,
          translatedFromProblemId: null
        },
        orderBy: { createdAt: "desc" },
        select: { translationGroupId: true }
      })
    : null;
  const fallbackTranslations = fallbackSource
    ? await prisma.problem.findMany({
        where: {
          translationGroupId: fallbackSource.translationGroupId,
          status: "PUBLISHED",
          listed: true
        },
        include: { author: true }
      })
    : [];
  const problem = selectContentTranslation(
    (translations.length ? translations : fallbackTranslations).map((candidate) => ({
      ...candidate,
      isSource: candidate.translatedFromProblemId === null
    })),
    preferredLanguage
  );
  if (!problem) return null;

  const usesSchedule = Boolean(scheduledGroup && problem.translationGroupId === scheduledGroup);
  return {
    problem,
    imageUrl: usesSchedule
      ? scheduled?.imageUrl || dailyProblemDefaultImageUrl(dateKey)
      : dailyProblemDefaultImageUrl(dateKey),
    imagePosition: tipImageObjectPosition(
      usesSchedule ? scheduled?.imagePositionX : 50,
      usesSchedule ? scheduled?.imagePositionY : 50
    ),
    automatic: !usesSchedule
  };
}
