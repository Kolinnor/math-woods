export const PROBLEM_CHALLENGE_MESSAGE_MAX_LENGTH = 500;

export type ProblemDeliveryIntent = "challenge" | "share";

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
  challengeDescription: string;
  challengeMode: string;
  challengeProblem: string;
  challengeSomeone: string;
  challengeUser: string;
  chooserTitle: string;
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
  shareDescription: string;
  shareMode: string;
  shareProblem: string;
  shareSomeone: string;
  shareUser: string;
  shareSend: string;
  shareSending: string;
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

export function problemShareNotificationBody({
  senderName,
  problemTitle,
  message
}: {
  senderName: string;
  problemTitle: string;
  message?: string | null;
}) {
  const introduction = `${senderName} shared the problem "${problemTitle}" with you.`;
  return message?.trim() ? `${introduction} ${message.trim()}` : introduction;
}
