import { Prisma, TipKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dailyProblemDateKey } from "@/lib/daily-problem-schedule";
import { selectDailyTipForDate } from "@/lib/daily-tip-schedule";
import { selectTipTranslation, type TipTranslationValue } from "@/lib/tip-translations";

export const DEFAULT_TIPS = [
  {
    title: "Use all the hypotheses of the problem.",
    description: "The first thing to do is to understand every word of the problem.",
    body: "List the assumptions one by one and ask what each of them prevents, allows, or forces. A hypothesis that looks decorative is often the key."
  },
  {
    title: "Try to solve a simpler problem.",
    description: "The most important skill in problem solving.",
    body: "Lower the dimension, shrink the numbers, remove a condition, or look at a toy version. A good simpler problem keeps the same soul with fewer moving parts."
  },
  {
    title: "Work backwards from what you need to prove.",
    description: "Start from the desired conclusion and ask what would be enough.",
    body: "Write the desired conclusion first, then ask which simpler statement would be enough to reach it."
  },
  {
    title: "Test the smallest nontrivial cases.",
    description: "Small examples reveal the shape of the problem before the solution is visible.",
    body: "Small examples often reveal the right conjecture, an overlooked exception, or the structure of a solution."
  },
  {
    title: "Name the quantity that does not change.",
    description: "Repeated processes often hide an invariant.",
    body: "When a process repeats, look for an invariant: parity, a sum, a product, an ordering, or a coloring."
  },
  {
    title: "Draw one more line than seems necessary.",
    description: "In geometry, the right auxiliary object can make the configuration speak.",
    body: "In geometry, an auxiliary line can expose similar triangles, cyclic quadrilaterals, or a useful symmetry."
  },
  {
    title: "Replace a difficult statement by its contrapositive.",
    description: "Negating the conclusion can make the hidden structure easier to see.",
    body: "A claim of the form \"if A, then B\" may become much easier when approached as \"if not B, then not A.\""
  },
  {
    title: "Separate existence from uniqueness.",
    description: "Finding an object and proving it is the only one are often different problems.",
    body: "First show that an object can be constructed. Then use a different argument to show there cannot be two."
  },
  {
    title: "Search for equality cases.",
    description: "Extremal behavior often points toward the right transformation.",
    body: "In an inequality, understanding when equality holds often points directly to the right transformation."
  },
  {
    title: "Choose notation that exposes structure.",
    description: "Good notation makes the important pattern hard to miss.",
    body: "Good notation reduces the number of facts you must remember and makes symmetries or recurrences visible."
  },
  {
    title: "Ask what would make the claim false.",
    description: "Counterexample hunting clarifies which hypotheses matter.",
    body: "Trying to build a counterexample is one of the fastest ways to discover which hypotheses actually matter."
  },
  {
    title: "Turn divisibility into an equation.",
    description: "Equations make divisibility constraints easier to combine with bounds or substitutions.",
    body: "Writing a divides b as b = ak often makes substitutions, bounds, and modular arguments much clearer."
  },
  {
    title: "Use symmetry before computation.",
    description: "Symmetry can erase work before it begins.",
    body: "Before expanding or calculating, check whether swapping variables or reflecting the configuration changes anything."
  },
  {
    title: "State the induction hypothesis precisely.",
    description: "A vague induction hypothesis usually creates a vague solution.",
    body: "A strong, explicit hypothesis makes the induction step easier and prevents accidental circular reasoning."
  },
  {
    title: "Change representations.",
    description: "The same object may become simple in another language.",
    body: "An algebraic expression may become obvious as a geometric picture, a counting argument, or a generating function."
  },
  {
    title: "Pause after finding a solution.",
    description: "The first solution is often only the entrance to the idea.",
    body: "Look for a shorter solution, a generalization, and the exact moment where the main idea entered."
  }
] as const;

export type TipEntry = {
  id: number;
  position: number;
  showInMainMenu: boolean;
  kind: TipKind;
  title: string;
  description: string;
  body: string;
  imageUrl: string | null;
  imagePositionX: number;
  imagePositionY: number;
  images: Array<{
    id: number;
    position: number;
    imageUrl: string;
    imagePositionX: number;
    imagePositionY: number;
  }>;
  translations: TipTranslationValue[];
};

export const DAILY_TIPS = DEFAULT_TIPS;

function defaultTipsWithIds(): TipEntry[] {
  return DEFAULT_TIPS.map((tip, index) => ({
    id: index + 1,
    position: index,
    showInMainMenu: false,
    kind: TipKind.TIP,
    imageUrl: null,
    imagePositionX: 50,
    imagePositionY: 50,
    images: [],
    translations: [{ language: "en", title: tip.title, body: tip.body }],
    ...tip
  }));
}

function isMissingTipTable(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}

export async function ensureDefaultTips() {
  try {
    const count = await prisma.tip.count();
    if (count === 0) {
      await prisma.tip.createMany({
        data: DEFAULT_TIPS.map((tip, index) => ({
          position: index,
          showInMainMenu: false,
          title: tip.title,
          description: tip.description,
          body: tip.body
        })),
        skipDuplicates: true
      });
    }

    const tipCount = count === 0 ? await prisma.tip.count() : count;
    const englishTranslationCount = await prisma.tipTranslation.count({ where: { language: "en" } });
    if (englishTranslationCount < tipCount) {
      const tips = await prisma.tip.findMany({ select: { id: true, title: true, body: true } });
      await prisma.tipTranslation.createMany({
        data: tips.map((tip) => ({ tipId: tip.id, language: "en", title: tip.title, body: tip.body })),
        skipDuplicates: true
      });
    }
  } catch (error) {
    if (isMissingTipTable(error)) return;
    throw error;
  }
}

export async function loadTips(preferredLanguage = "en"): Promise<TipEntry[]> {
  try {
    await ensureDefaultTips();
    const tips = await prisma.tip.findMany({
      orderBy: { position: "asc" },
      include: {
        images: { orderBy: { position: "asc" } },
        translations: { orderBy: { language: "asc" } }
      }
    });
    if (tips.length > 0) {
      return tips.map((tip) => ({
        ...tip,
        ...selectTipTranslation(tip.translations, preferredLanguage, tip)
      }));
    }
  } catch (error) {
    if (!isMissingTipTable(error)) throw error;
  }

  return defaultTipsWithIds();
}

export async function loadTip(id: number) {
  try {
    await ensureDefaultTips();
    return prisma.tip.findUnique({
      where: { id },
      include: {
        images: { orderBy: { position: "asc" } },
        translations: { orderBy: { language: "asc" } }
      }
    });
  } catch (error) {
    if (isMissingTipTable(error)) return null;
    throw error;
  }
}

export function dailyTip(date = new Date()) {
  const dayNumber = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  );

  return DEFAULT_TIPS[dayNumber % DEFAULT_TIPS.length];
}

export async function loadDailyTip(date = new Date(), preferredLanguage = "en") {
  const tips = await loadTips(preferredLanguage);
  const dateKey = dailyProblemDateKey(date);
  const [schedule, rotationSelection] = await Promise.all([
    prisma.dailyTipSchedule.findUnique({
      where: { dateKey },
      select: { tipId: true }
    }),
    prisma.dailyTipRotationSelection.findUnique({
      where: { dateKey },
      select: { tipId: true }
    })
  ]);

  const selectedTip = selectDailyTipForDate(
    tips,
    dateKey,
    schedule?.tipId ?? null,
    rotationSelection?.tipId ?? null
  );
  const isToday = dateKey === dailyProblemDateKey();
  if (schedule || rotationSelection || !selectedTip || !isToday) return selectedTip;

  await prisma.dailyTipRotationSelection.createMany({
    data: [{ dateKey, tipId: selectedTip.id }],
    skipDuplicates: true
  });
  const lockedSelection = await prisma.dailyTipRotationSelection.findUnique({
    where: { dateKey },
    select: { tipId: true }
  });

  return selectDailyTipForDate(tips, dateKey, null, lockedSelection?.tipId ?? selectedTip.id);
}
