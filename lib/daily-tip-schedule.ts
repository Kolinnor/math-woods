import { dailyProblemRotationIndex } from "./daily-problem-schedule.ts";

export function selectDailyTipForDate<T extends { id: number; showInMainMenu: boolean }>(
  tips: readonly T[],
  dateKey: string,
  scheduledTipId: number | null = null
) {
  const scheduledTip = scheduledTipId === null
    ? null
    : tips.find((tip) => tip.id === scheduledTipId) ?? null;
  if (scheduledTip) return scheduledTip;

  const rotation = tips.filter((tip) => tip.showInMainMenu);
  if (rotation.length === 0) return null;
  return rotation[dailyProblemRotationIndex(rotation.length, dateKey)] ?? null;
}
