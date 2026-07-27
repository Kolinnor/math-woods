export const PROBLEM_CHALLENGE_MESSAGE_MAX_LENGTH = 500;

export type ProblemChallengeError =
  | "chooseProblem"
  | "chooseUser"
  | "duplicate"
  | "problemUnavailable"
  | "rateLimited"
  | "selfChallenge"
  | "userUnavailable";

export type ProblemChallengeLabels = {
  button: string;
  cancel: string;
  challengeProblem: string;
  challengeSomeone: string;
  challengeUser: string;
  close: string;
  messagePlaceholder: string;
  noResults: string;
  noUsersFound: string;
  problem: string;
  recipient: string;
  searchPlaceholder: string;
  searchUserPlaceholder: string;
  searching: string;
  send: string;
  sending: string;
  errors: Record<ProblemChallengeError, string>;
};

export function normalizeProblemChallengeMessage(value: FormDataEntryValue | string | null | undefined) {
  return String(value ?? "").trim().slice(0, PROBLEM_CHALLENGE_MESSAGE_MAX_LENGTH);
}

export function problemChallengeNotificationBody({
  challengerName,
  problemTitle,
  message
}: {
  challengerName: string;
  problemTitle: string;
  message?: string | null;
}) {
  const invitation = `${challengerName} challenged you to solve "${problemTitle}".`;
  return message?.trim() ? `${invitation} ${message.trim()}` : invitation;
}
