import { HistoryMilestoneType } from "@prisma/client";

export function submittedHistoryPeriod(formData: FormData) {
  const fr = formData.get("language") === "fr";
  const milestoneType = String(formData.get("milestoneType") ?? "") as HistoryMilestoneType;
  if (!Object.values(HistoryMilestoneType).includes(milestoneType)) {
    throw new Error(fr ? "Nature du repère invalide." : "Invalid milestone type.");
  }
  const readYear = (name: string) => {
    const raw = String(formData.get(name) ?? "").trim();
    const year = Number(raw);
    if (!/^-?\d+$/.test(raw) || !Number.isInteger(year) || year < -5000 || year > 3000) {
      throw new Error(fr ? "Saisissez une année entière entre −5000 et 3000." : "Enter a whole year between −5000 and 3000.");
    }
    return year;
  };
  const sortYear = readYear("sortYear");
  const endYear = milestoneType === HistoryMilestoneType.PERIOD && String(formData.get("endYear") ?? "").trim()
    ? readYear("endYear") : null;
  if (endYear !== null && endYear < sortYear) {
    throw new Error(fr ? "La fin de la période doit être postérieure ou égale à son début." : "The period must end on or after its start year.");
  }
  return { milestoneType, sortYear, endYear };
}
