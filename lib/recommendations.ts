import { isProblemRecommendationEligible } from "./problem-recommendation-eligibility.ts";

export const RECOMMENDATION_MODEL_VERSION = 3;

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

export type RecommendationProfileInput = {
  mathLevel: RecommendationMathLevel | null;
  mathematicalDomains: string[];
  attempts: RecommendationAttempt[];
  favorites: RecommendationFavorite[];
  reactions?: RecommendationReaction[];
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

  const domains = Object.fromEntries(
    [...domainEvidence.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([domain, evidence]) => {
        const selectedByUser = selectedDomains.has(domain);
        const behavioralEvidence = Math.max(0, evidence - (selectedByUser ? 1.75 : 0));
        return [
          domain,
          {
            affinity: rounded(clamp((selectedByUser ? 0.35 : 0) + (1 - Math.exp(-behavioralEvidence / 4)), 0, 1)),
            confidence: rounded(clamp(1 - Math.exp(-evidence / 5), 0, 0.95)),
            evidence: rounded(evidence),
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

  if (candidate.favorite) parts.push(scorePart("favorite", "Previously favorited", 7));
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
