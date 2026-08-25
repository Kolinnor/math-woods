import { isProblemRecommendationEligible } from "./problem-recommendation-eligibility.ts";

export const RECOMMENDATION_MODEL_VERSION = 6;

const DAY_MS = 24 * 60 * 60 * 1000;

export type RecommendationMathLevel =
  | "BEGINNER_PRE_UNIVERSITY"
  | "EARLY_UNDERGRAD"
  | "UNDERGRAD"
  | "ADVANCED_UNDERGRAD"
  | "GRADUATE_CONTEST"
  | "RESEARCH";

export type RecommendationAttemptStatus = "STARTED" | "BLOCKED" | "SOLVED" | "REVIEW_LATER";
export type RecommendationQualityStatus = "UNREVIEWED" | "REVIEWED" | "NEEDS_WORK";
export type RecommendationActivityEventType =
  | "OPENED"
  | "STARTED"
  | "SOLVED"
  | "BLOCKED"
  | "TOO_HARD"
  | "TOO_EASY";

export type RecommendationActivityEvent = {
  eventType: RecommendationActivityEventType;
  dateKey: string;
};

export type RecommendationDifficultyAdjustment = {
  offset: number;
  adjustedTargetDifficulty: number;
  qualifiedDays: number;
  consecutiveUnsolvedDays: number;
  reason: "none" | "unsolved" | "recovery";
};

export type RecommendationAttempt = {
  translationGroupId: string;
  difficulty: number | null;
  domains: string[];
  status: RecommendationAttemptStatus;
  updatedAt: Date;
};

export type RecommendationFavorite = {
  translationGroupId: string;
  domains: string[];
  createdAt: Date;
};

export type RecommendationReaction = {
  difficulty: number | null;
  domains: string[];
  difficultyReaction: "TOO_HARD" | "TOO_EASY" | "FEELS_RIGHT" | null;
  preferenceReaction: "MORE_LIKE_THIS" | "LESS_LIKE_THIS" | null;
  updatedAt: Date;
};

export type RecommendationDismissal = {
  difficulty: number | null;
  domains: string[];
  reason: "TOO_HARD" | "TOO_EASY" | "LESS_LIKE_THIS" | "ALREADY_KNOWN" | "NOT_INTERESTED_IN_DOMAIN";
  updatedAt: Date;
};

export type RecommendationProfileInput = {
  mathLevel: RecommendationMathLevel | null;
  mathematicalDomains: string[];
  attempts: RecommendationAttempt[];
  favorites: RecommendationFavorite[];
  reactions?: RecommendationReaction[];
  dismissals?: RecommendationDismissal[];
};

export type RecommendationDomainSignal = {
  affinity: number;
  confidence: number;
  evidence: number;
  selectedByUser: boolean;
};

export type RecommendationProfile = {
  modelVersion: number;
  targetDifficulty: number;
  difficultyConfidence: number;
  declaredDifficulty: number;
  evidenceCount: number;
  domains: Record<string, RecommendationDomainSignal>;
};

export type RecommendationCandidate = {
  id: number;
  translationGroupId: string;
  difficulty: number | null;
  isConjecture: boolean;
  domains: string[];
  qualityStatus: RecommendationQualityStatus;
  isExercise: boolean;
  createdAt: Date;
  attemptStatus?: RecommendationAttemptStatus | null;
  attemptUpdatedAt?: Date | null;
  favorite?: boolean;
  exposureCount?: number;
  lastOpenedAt?: Date | null;
};

export type RecommendationScorePart = {
  code: string;
  label: string;
  points: number;
};

export type ProblemRecommendationScore = {
  score: number;
  confidence: number;
  parts: RecommendationScorePart[];
};

export type RecommendationSelectionReason = "continue" | "fit" | "confidence" | "explore" | "ranked";

export type RecommendationSelectionCandidate = {
  problem: {
    id: number;
    difficulty: number | null;
    domains: string[];
  };
  score: number;
  confidence: number;
  attemptStatus?: RecommendationAttemptStatus | null;
};

const DECLARED_DIFFICULTY: Record<RecommendationMathLevel, number> = {
  BEGINNER_PRE_UNIVERSITY: 6,
  EARLY_UNDERGRAD: 18,
  UNDERGRAD: 38,
  ADVANCED_UNDERGRAD: 60,
  GRADUATE_CONTEST: 80,
  RESEARCH: 95
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function dateKeyDayNumber(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function moveOffsetTowardZero(offset: number, points: number) {
  return Math.min(0, offset + points);
}

export function recommendationDifficultyAdjustment(
  baseTargetDifficulty: number,
  events: RecommendationActivityEvent[],
  todayDateKey: string
): RecommendationDifficultyAdjustment {
  const eventsByDay = new Map<string, RecommendationActivityEventType[]>();
  for (const event of events) {
    eventsByDay.set(event.dateKey, [...(eventsByDay.get(event.dateKey) ?? []), event.eventType]);
  }

  const todayDayNumber = dateKeyDayNumber(todayDateKey);
  const days = [...eventsByDay.keys()]
    .filter((dateKey) => dateKeyDayNumber(dateKey) <= todayDayNumber)
    .sort();
  let offset = 0;
  let qualifiedDays = 0;
  let consecutiveUnsolvedDays = 0;
  let previousQualifiedUnsolvedDay: number | null = null;
  let previousEventDay: number | null = null;
  let reason: RecommendationDifficultyAdjustment["reason"] = "none";

  for (const dateKey of days) {
    const dayNumber = dateKeyDayNumber(dateKey);
    if (previousEventDay !== null) {
      const inactiveDays = dayNumber - previousEventDay;
      if (inactiveDays >= 7) offset = moveOffsetTowardZero(offset, Math.floor(inactiveDays / 7) * 3);
    }
    previousEventDay = dayNumber;

    const dayEvents = eventsByDay.get(dateKey) ?? [];
    const eventSet = new Set(dayEvents);
    const solveCount = dayEvents.filter((eventType) => eventType === "SOLVED").length;
    const isToday = dayNumber === todayDayNumber;

    if (solveCount > 0 || eventSet.has("TOO_EASY")) {
      const recovery = solveCount >= 2 || eventSet.has("TOO_EASY") ? 8 : 5;
      offset = moveOffsetTowardZero(offset, recovery);
      previousQualifiedUnsolvedDay = null;
      consecutiveUnsolvedDays = 0;
      reason = offset === 0 ? "none" : "recovery";
      continue;
    }

    if (isToday) {
      if (eventSet.has("TOO_HARD") || eventSet.has("BLOCKED")) {
        offset = Math.min(offset, -10);
        reason = "unsolved";
      }
      continue;
    }

    if (!eventSet.has("OPENED")) continue;
    qualifiedDays += 1;
    const penalty = eventSet.has("TOO_HARD") || eventSet.has("BLOCKED")
      ? 10
      : eventSet.has("STARTED")
        ? 7
        : 5;
    if (previousQualifiedUnsolvedDay !== null && dayNumber - previousQualifiedUnsolvedDay === 1) {
      offset = Math.max(-15, offset - penalty);
      consecutiveUnsolvedDays += 1;
    } else {
      offset = Math.min(offset, -penalty);
      consecutiveUnsolvedDays = 1;
    }
    previousQualifiedUnsolvedDay = dayNumber;
    reason = "unsolved";
  }

  if (previousEventDay !== null) {
    const inactiveDays = todayDayNumber - previousEventDay;
    if (inactiveDays >= 7) offset = moveOffsetTowardZero(offset, Math.floor(inactiveDays / 7) * 3);
  }
  offset = Math.round(clamp(offset, -15, 0));
  if (offset === 0) reason = "none";

  return {
    offset,
    adjustedTargetDifficulty: Math.round(clamp(baseTargetDifficulty + offset, 1, 89)),
    qualifiedDays,
    consecutiveUnsolvedDays,
    reason
  };
}

export function composeProblemRecommendations<T extends RecommendationSelectionCandidate>(
  candidates: T[],
  requestedLimit: number,
  adjustedTargetDifficulty: number,
  domains: RecommendationProfile["domains"]
): Array<T & { selectionReason: RecommendationSelectionReason }> {
  const limit = Math.max(0, Math.trunc(requestedLimit));
  const ranked = [...candidates].sort(
    (left, right) => right.score - left.score || right.confidence - left.confidence || left.problem.id - right.problem.id
  );
  const selected: Array<T & { selectionReason: RecommendationSelectionReason }> = [];
  const selectedIds = new Set<number>();

  function add(candidate: T | undefined, selectionReason: RecommendationSelectionReason) {
    if (!candidate || selectedIds.has(candidate.problem.id) || selected.length >= limit) return;
    selectedIds.add(candidate.problem.id);
    selected.push({ ...candidate, selectionReason });
  }

  add(ranked.find((candidate) => candidate.attemptStatus === "STARTED"), "continue");

  const fitCount = selected.length ? 1 : 2;
  ranked
    .filter((candidate) =>
      candidate.problem.difficulty !== null &&
      Math.abs(candidate.problem.difficulty - adjustedTargetDifficulty) <= 8
    )
    .slice(0, fitCount + selected.length)
    .forEach((candidate) => add(candidate, "fit"));

  const easier = ranked.find((candidate) =>
    candidate.problem.difficulty !== null &&
    candidate.problem.difficulty <= adjustedTargetDifficulty - 10 &&
    candidate.problem.difficulty >= adjustedTargetDifficulty - 25
  ) ?? ranked.find((candidate) =>
    candidate.problem.difficulty !== null && candidate.problem.difficulty < adjustedTargetDifficulty - 8
  );
  add(easier, "confidence");

  const selectedDomains = new Set(selected.flatMap((candidate) => candidate.problem.domains));
  const exploration = ranked.find((candidate) =>
    candidate.problem.domains.some((domain) =>
      !selectedDomains.has(domain) && (domains[domain]?.affinity ?? 0) < 0.35
    )
  );
  add(exploration, "explore");

  ranked.forEach((candidate) => add(candidate, "ranked"));
  return selected;
}

export function excludedRecommendationGroupIds(
  solvedGroupIds: Iterable<string>,
  authoredGroupIds: Iterable<string>,
  dismissedGroupIds: Iterable<string> = []
) {
  return [...new Set([...solvedGroupIds, ...authoredGroupIds, ...dismissedGroupIds])];
}

function rounded(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function recencyWeight(date: Date, now: Date, halfLifeDays = 180) {
  const ageDays = Math.max(0, now.getTime() - date.getTime()) / DAY_MS;
  return 0.5 ** (ageDays / halfLifeDays);
}

function declaredDifficulty(mathLevel: RecommendationMathLevel | null) {
  return mathLevel ? DECLARED_DIFFICULTY[mathLevel] : 38;
}

function domainEvidenceForAttempt(status: RecommendationAttemptStatus) {
  if (status === "SOLVED") return 2.5;
  if (status === "STARTED") return 1;
  if (status === "BLOCKED") return 0.8;
  return 0.6;
}

export function buildRecommendationProfile(
  input: RecommendationProfileInput,
  now = new Date()
): RecommendationProfile {
  const declared = declaredDifficulty(input.mathLevel);
  const priorWeight = input.mathLevel ? 5 : 2;
  let weightedDifficulty = declared * priorWeight;
  let difficultyWeight = priorWeight;
  let evidenceCount = 0;

  const domainEvidence = new Map<string, number>();
  const domainNegativeEvidence = new Map<string, number>();
  const selectedDomains = new Set(input.mathematicalDomains);
  for (const domain of selectedDomains) domainEvidence.set(domain, 1.75);

  for (const attempt of input.attempts) {
    const recency = recencyWeight(attempt.updatedAt, now);
    const evidence = domainEvidenceForAttempt(attempt.status) * recency;
    evidenceCount += evidence;
    for (const domain of new Set(attempt.domains)) {
      domainEvidence.set(domain, (domainEvidence.get(domain) ?? 0) + evidence);
    }

    if (attempt.difficulty === null) continue;
    if (attempt.status === "SOLVED") {
      const weight = 3 * recency;
      weightedDifficulty += clamp(attempt.difficulty + 3, 1, 100) * weight;
      difficultyWeight += weight;
    } else if (attempt.status === "BLOCKED") {
      const weight = 0.8 * recency;
      weightedDifficulty += clamp(attempt.difficulty - 8, 1, 100) * weight;
      difficultyWeight += weight;
    }
  }

  for (const favorite of input.favorites) {
    const evidence = 1.25 * recencyWeight(favorite.createdAt, now);
    evidenceCount += evidence;
    for (const domain of new Set(favorite.domains)) {
      domainEvidence.set(domain, (domainEvidence.get(domain) ?? 0) + evidence);
    }
  }

  for (const reaction of input.reactions ?? []) {
    const recency = recencyWeight(reaction.updatedAt, now, 240);
    if (reaction.preferenceReaction) {
      const evidence = (reaction.preferenceReaction === "MORE_LIKE_THIS" ? 2 : -1.5) * recency;
      evidenceCount += Math.abs(evidence);
      for (const domain of new Set(reaction.domains)) {
        domainEvidence.set(domain, Math.max(0, (domainEvidence.get(domain) ?? 0) + evidence));
      }
    }
    if (reaction.difficulty !== null && reaction.difficultyReaction) {
      const adjustment =
        reaction.difficultyReaction === "TOO_HARD"
          ? -8
          : reaction.difficultyReaction === "TOO_EASY"
            ? 8
            : 2;
      const weight = 2.5 * recency;
      weightedDifficulty += clamp(reaction.difficulty + adjustment, 1, 100) * weight;
      difficultyWeight += weight;
      evidenceCount += weight;
    }
  }

  for (const dismissal of input.dismissals ?? []) {
    const recency = recencyWeight(dismissal.updatedAt, now, 240);
    const domainPenalty = dismissal.reason === "NOT_INTERESTED_IN_DOMAIN"
      ? 4
      : dismissal.reason === "LESS_LIKE_THIS"
        ? 1.5
        : 0;
    if (domainPenalty > 0) {
      const evidence = domainPenalty * recency;
      evidenceCount += evidence;
      for (const domain of new Set(dismissal.domains)) {
        if (!domainEvidence.has(domain)) domainEvidence.set(domain, 0);
        domainNegativeEvidence.set(domain, (domainNegativeEvidence.get(domain) ?? 0) + evidence);
      }
    }
    if (
      dismissal.difficulty !== null &&
      (dismissal.reason === "TOO_HARD" || dismissal.reason === "TOO_EASY")
    ) {
      const weight = 2.5 * recency;
      const adjustment = dismissal.reason === "TOO_HARD" ? -8 : 8;
      weightedDifficulty += clamp(dismissal.difficulty + adjustment, 1, 100) * weight;
      difficultyWeight += weight;
      evidenceCount += weight;
    }
  }

  const domains = Object.fromEntries(
    [...domainEvidence.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([domain, evidence]) => {
        const selectedByUser = selectedDomains.has(domain);
        const behavioralEvidence = Math.max(0, evidence - (selectedByUser ? 1.75 : 0));
        const negativeEvidence = domainNegativeEvidence.get(domain) ?? 0;
        const positiveAffinity = (selectedByUser ? 0.35 : 0) + (1 - Math.exp(-behavioralEvidence / 4));
        return [
          domain,
          {
            affinity: rounded(clamp(positiveAffinity * Math.exp(-negativeEvidence / 2.5), 0, 1)),
            confidence: rounded(clamp(1 - Math.exp(-(evidence + negativeEvidence) / 5), 0, 0.95)),
            evidence: rounded(evidence - negativeEvidence),
            selectedByUser
          }
        ];
      })
  );

  const observedDifficultyEvidence = Math.max(0, difficultyWeight - priorWeight);
  return {
    modelVersion: RECOMMENDATION_MODEL_VERSION,
    targetDifficulty: Math.round(clamp(weightedDifficulty / difficultyWeight, 1, 100)),
    difficultyConfidence: rounded(
      clamp((input.mathLevel ? 0.3 : 0.05) + (1 - Math.exp(-observedDifficultyEvidence / 8)) * 0.65, 0.05, 0.95)
    ),
    declaredDifficulty: declared,
    evidenceCount: rounded(evidenceCount),
    domains
  };
}

function scorePart(code: string, label: string, points: number): RecommendationScorePart {
  return { code, label, points: Math.round(points) };
}

function isPreUniversity(level: RecommendationMathLevel | null) {
  return level === "BEGINNER_PRE_UNIVERSITY" || level === "EARLY_UNDERGRAD";
}

export function scoreProblemRecommendation(
  profile: RecommendationProfile,
  candidate: RecommendationCandidate,
  options: { mathLevel: RecommendationMathLevel | null; now?: Date }
): ProblemRecommendationScore | null {
  if (!isProblemRecommendationEligible(candidate) || candidate.attemptStatus === "SOLVED") return null;

  const now = options.now ?? new Date();
  const parts: RecommendationScorePart[] = [];

  if (candidate.difficulty === null) {
    parts.push(scorePart("difficulty_unknown", "Difficulty is not rated", -2));
  } else {
    const distance = Math.abs(candidate.difficulty - profile.targetDifficulty);
    parts.push(scorePart("difficulty_fit", "Difficulty fit", clamp(34 - distance * 0.72, -14, 34)));
  }

  const domainSignals = candidate.domains
    .map((domain) => ({ domain, signal: profile.domains[domain] }))
    .filter((item): item is { domain: string; signal: RecommendationDomainSignal } => Boolean(item.signal));
  const bestDomain = domainSignals.sort((left, right) => right.signal.affinity - left.signal.affinity)[0];
  if (bestDomain) {
    parts.push(scorePart("domain_relevance", `Relevant domain: ${bestDomain.domain}`, bestDomain.signal.affinity * 18));
  } else {
    parts.push(scorePart("domain_discovery", "Adds domain diversity", 5));
  }

  const qualityPoints =
    candidate.qualityStatus === "REVIEWED" ? 10 : candidate.qualityStatus === "NEEDS_WORK" ? -12 : 2;
  parts.push(scorePart("quality", `Quality status: ${candidate.qualityStatus.toLowerCase()}`, qualityPoints));

  if (candidate.attemptStatus === "STARTED") {
    const ageDays = candidate.attemptUpdatedAt
      ? Math.max(0, now.getTime() - candidate.attemptUpdatedAt.getTime()) / DAY_MS
      : 0;
    const resumePoints = ageDays < 2 ? 15 : ageDays < 5 ? 7 : ageDays < 10 ? -4 : -10;
    parts.push(scorePart("resume", "Continue a started problem", resumePoints));
  } else if (candidate.attemptStatus === "REVIEW_LATER") {
    parts.push(scorePart("review_later", "Saved to revisit", 11));
  } else if (candidate.attemptStatus === "BLOCKED") {
    const ageDays = candidate.attemptUpdatedAt
      ? Math.max(0, now.getTime() - candidate.attemptUpdatedAt.getTime()) / DAY_MS
      : 0;
    parts.push(
      ageDays < 14
        ? scorePart("recently_blocked", "Recently marked as blocked", -9)
        : scorePart("blocked_return", "Ready to revisit after a pause", 2)
    );
  }

  if (candidate.exposureCount && candidate.lastOpenedAt) {
    const daysSinceLastOpen = Math.max(0, now.getTime() - candidate.lastOpenedAt.getTime()) / DAY_MS;
    const activeExposureCount = Math.min(6, candidate.exposureCount);
    const recency = 0.5 ** (daysSinceLastOpen / 14);
    const fatiguePoints = -Math.round(Math.max(0, activeExposureCount - 1) * 6 * recency);
    if (fatiguePoints < 0) {
      parts.push(scorePart("exposure_fatigue", "Repeatedly opened without solving", fatiguePoints));
    }
  }

  if (candidate.favorite) parts.push(scorePart("favorite", "Previously liked", 7));
  if (candidate.isExercise && isPreUniversity(options.mathLevel)) {
    parts.push(scorePart("exercise_fit", "Practice exercise for the selected level", 5));
  }

  const ageDays = Math.max(0, now.getTime() - candidate.createdAt.getTime()) / DAY_MS;
  if (ageDays <= 30) parts.push(scorePart("freshness", "Recently published", 3));

  const score = parts.reduce((total, part) => total + part.points, 0);
  const hasKnownDifficulty = candidate.difficulty !== null ? 1 : 0;
  const domainConfidence = bestDomain?.signal.confidence ?? 0;
  const confidence = clamp(
    0.2 + profile.difficultyConfidence * 0.45 + hasKnownDifficulty * 0.15 + domainConfidence * 0.2,
    0.2,
    0.95
  );

  return { score, confidence: rounded(confidence), parts };
}
