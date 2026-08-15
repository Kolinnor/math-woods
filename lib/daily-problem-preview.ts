import {
  automaticDailyProblemGroup,
  dailyProblemDefaultImageUrl,
  isDailyProblemDateKey
} from "@/lib/daily-problem-schedule";
import { prisma } from "@/lib/db";
import { tipImageObjectPosition } from "@/lib/tip-images";
import { selectContentTranslation } from "@/lib/translation-routing";

type DailyProblemPreviewOptions = {
  imagePositionX?: number | null;
  imagePositionY?: number | null;
  imageUrl?: string | null;
  problemId?: number | null;
};

export async function loadDailyProblemPreview(
  dateKey: string,
  preferredLanguage: string,
  options: DailyProblemPreviewOptions = {}
) {
  if (!isDailyProblemDateKey(dateKey)) return null;

  const usesDraft = options.problemId !== undefined;
  const [scheduled, draftProblem] = await Promise.all([
    usesDraft
      ? null
      : prisma.dailyProblemSchedule.findUnique({
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
        }),
    usesDraft && options.problemId
      ? prisma.problem.findFirst({
          where: { id: options.problemId, status: "PUBLISHED", listed: true, isExercise: false },
          select: { translationGroupId: true }
        })
      : null
  ]);
  if (usesDraft && options.problemId && !draftProblem) return null;

  const scheduledGroup = usesDraft
    ? draftProblem?.translationGroupId ?? null
    : scheduled?.problem.status === "PUBLISHED"
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
  const imageUrl = usesDraft
    ? options.imageUrl || dailyProblemDefaultImageUrl(dateKey)
    : scheduled?.imageUrl || dailyProblemDefaultImageUrl(dateKey);
  const imagePositionX = usesDraft ? options.imagePositionX : scheduled?.imagePositionX;
  const imagePositionY = usesDraft ? options.imagePositionY : scheduled?.imagePositionY;

  return {
    problem,
    imageUrl: usesSchedule ? imageUrl : dailyProblemDefaultImageUrl(dateKey),
    imagePosition: tipImageObjectPosition(
      usesSchedule ? imagePositionX : 50,
      usesSchedule ? imagePositionY : 50
    ),
    automatic: !usesSchedule
  };
}
