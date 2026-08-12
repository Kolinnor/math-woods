type SolvedAttemptDate = {
  solvedAt: Date | null;
  status: string;
  updatedAt: Date;
};

export function problemSolvedAt(attempts: SolvedAttemptDate[]) {
  const solvedDates = attempts
    .filter((attempt) => attempt.status === "SOLVED")
    .map((attempt) => attempt.solvedAt ?? attempt.updatedAt);

  if (solvedDates.length === 0) return null;
  return new Date(Math.min(...solvedDates.map((date) => date.getTime())));
}

export function formatProblemSolvedDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}
