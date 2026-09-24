export const POLL_LIMITS = { question: 240, option: 160, minOptions: 2, maxOptions: 8 } as const;

export const announcementPollCopy = {
  fr: {
    add: "Ajouter un sondage", question: "Question", options: "Réponses proposées",
    optionsHelp: "De 2 à 8 réponses distinctes, une par ligne (160 caractères maximum chacune).",
    rules: "Un choix par membre. Vous pouvez modifier votre vote tant que le sondage est ouvert. Les résultats apparaissent après le vote ou à la clôture, sans liste des votants.",
    vote: "Voter", change: "Modifier mon vote", save: "Enregistrer mon choix", selected: "Votre choix",
    closed: "Sondage clos", close: "Clore le sondage", reopen: "Rouvrir le sondage",
    results: "Résultats du sondage", votes: (n: number) => `${n} vote${n === 1 ? "" : "s"}`,
    invalidContent: "Indiquez un titre (160 caractères maximum) et un message (4 000 caractères maximum).",
    invalidQuestion: "Indiquez une question de 240 caractères maximum pour le sondage.",
    invalidOptions: "Proposez de 2 à 8 réponses distinctes, de 160 caractères maximum chacune.",
    invalidVote: "Choisissez l’une des réponses de ce sondage.",
    unavailable: "Ce sondage est clos ou n’est plus disponible. Actualisez la page pour consulter son état.",
    rateLimit: "Vous allez trop vite. Patientez un instant puis réessayez ; votre saisie est conservée."
  },
  en: {
    add: "Add a poll", question: "Question", options: "Answer options",
    optionsHelp: "2 to 8 distinct answers, one per line (up to 160 characters each).",
    rules: "One choice per member. You can change your vote while the poll is open. Results appear after voting or when the poll closes, without a voter list.",
    vote: "Vote", change: "Change my vote", save: "Save my choice", selected: "Your choice",
    closed: "Poll closed", close: "Close poll", reopen: "Reopen poll",
    results: "Poll results", votes: (n: number) => `${n} vote${n === 1 ? "" : "s"}`,
    invalidContent: "Enter a title (up to 160 characters) and a message (up to 4,000 characters).",
    invalidQuestion: "Enter a poll question of up to 240 characters.",
    invalidOptions: "Provide 2 to 8 distinct answers of up to 160 characters each.",
    invalidVote: "Choose one of this poll’s answers.",
    unavailable: "This poll is closed or no longer available. Refresh the page to see its current status.",
    rateLimit: "You are going too fast. Wait a moment and try again; your input has been preserved."
  }
} as const;

export class AnnouncementInputError extends Error {
  readonly reason: "invalidContent" | "invalidQuestion" | "invalidOptions" | "invalidVote" | "unavailable";
  constructor(reason: AnnouncementInputError["reason"]) {
    super(reason);
    this.reason = reason;
    this.name = "AnnouncementInputError";
  }
}

export function parseAnnouncementPoll(formData: FormData) {
  if (formData.get("includePoll") !== "on") return null;
  const question = String(formData.get("pollQuestion") ?? "").trim();
  if (!question || question.length > POLL_LIMITS.question) throw new AnnouncementInputError("invalidQuestion");
  const raw = String(formData.get("pollOptions") ?? "");
  if (raw.length > 2000) throw new AnnouncementInputError("invalidOptions");
  const options = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (options.length < POLL_LIMITS.minOptions || options.length > POLL_LIMITS.maxOptions
    || options.some(option => option.length > POLL_LIMITS.option)
    || new Set(options.map(option => option.normalize("NFKC").toLowerCase())).size !== options.length) {
    throw new AnnouncementInputError("invalidOptions");
  }
  return { question, options };
}
