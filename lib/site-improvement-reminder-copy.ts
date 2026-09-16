export const SITE_IMPROVEMENT_REMINDER_HREF = "/contributing/tasks/site-improvements";

export function siteImprovementReminderDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23"
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)!.value;
  if (Number(value("hour")) < 18) return null;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function siteImprovementReminderCopy(count: number, locale: "fr" | "en") {
  return locale === "fr"
    ? {
        title: `Il reste ${count} amélioration${count === 1 ? "" : "s"} du site à faire`,
        body: "Consultez la liste des améliorations du site pour choisir la prochaine tâche."
      }
    : {
        title: `${count} site improvement${count === 1 ? "" : "s"} remaining`,
        body: "Open the site improvements board to choose the next task."
      };
}
