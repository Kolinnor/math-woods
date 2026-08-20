# Problem recommendations

Math Woods recommendations optimize for a useful next mathematical step, not time spent on the site.

## Current scope

The model powers the recommendation cards on the home page, the recommendation reader in the problem browser, and the
next-problem card shown after a solve. Admins can inspect its full scoring breakdown through:

`GET /api/recommendations/shadow?username=USERNAME&limit=20`

Scores and profiles are computed on demand. The site persists only deduplicated recommendation events and repeated-open
counts; it does not persist a hidden user score. This avoids stale profiles while allowing short-term adaptation.

## Inputs

- declared mathematics level;
- declared mathematical domains;
- deduplicated attempts across translations;
- solved, blocked, started and review-later states;
- favorites and explicit reactions;
- problem difficulty, domain, quality, type and publication date.

The model does not use login frequency, general page views, dwell time, cursor activity or inferred abandonment. An open
is counted only when a signed-in user follows a link produced by the recommendation system. Opening the same recommended
translation group repeatedly on one day creates a single daily `OPENED` event.

## Long-term profile and score

The internal profile contains a target difficulty, its confidence, and domain affinities with separate evidence and
confidence values. These are estimates for ranking content, not measures of a person's worth or mathematical ability.

Each user-problem pair receives explainable components for difficulty fit, domain relevance or discovery, review status,
resuming an attempt, favorites, exercise suitability for introductory levels, freshness and repeated-open fatigue.
Difficulty reactions adjust the long-term target gradually; more/less-like-this reactions adjust domain affinities.

Solved translation groups and problems authored by the user are excluded. Recent blocked attempts are temporarily
penalized rather than interpreted as permanent dislike.

## Short-term difficulty adaptation

The permanent target above changes slowly from declared level and long-term evidence. A separate temporary offset reacts
to recent recommendation outcomes. It is capped between `0` and `-15`, so it can make the next set easier without
rewriting the user's level.

Only a qualified recommendation day can create an automatic penalty: the user must have opened a problem from a
recommendation. A login without a recommendation open has no effect.

| Qualified outcome | Temporary effect |
| --- | ---: |
| Opened, not solved by the end of the day | `-5` |
| Started, not solved by the end of the day | `-7` |
| Blocked or marked too hard | up to `-10` immediately |
| Consecutive qualified days without a solve | penalties accumulate, capped at `-15` |
| Solved a recommended problem | `+5` toward zero |
| Multiple solves that day, or marked too easy | `+8` toward zero |

An unsolved day is evaluated only after that calendar day has ended in the site timezone (`Europe/Paris`). This avoids
classifying an attempt as unsuccessful while the user is still working. Outcomes remain linked to a recommendation for
14 days after its open. After inactivity, the offset decays toward zero by 3 points per complete week.

## Set composition

Ranking uses the explainable score, with its difficulty component evaluated against the temporarily adjusted target. The
first four available positions are then diversified:

1. a recently started problem first, when one exists;
2. one or two problems within 8 difficulty points of the adjusted target;
3. one confidence-building problem roughly 10-25 points easier;
4. one problem that introduces a lower-affinity domain not already represented.

Missing categories fall back to the highest-ranked remaining candidates. Larger lists are filled by score after this
diversified prefix. Every returned item includes an internal `selectionReason` (`continue`, `fit`, `confidence`,
`explore`, or `ranked`) for shadow inspection; the reason is not shown as a judgment about the user.

## Event storage

`RecommendationEvent` is append-only at daily granularity and unique by user, date, problem scope, and event type. Events
store the translation group so opening one language and solving another remains one learning sequence. Events older than
90 days are not loaded by the online ranker.

The legacy `ProblemRecommendationExposure` aggregate remains responsible for candidate fatigue. It is now updated only
for genuine recommendation opens and is removed when the translation group is solved.

## Guardrails

- The score is internal and must not be displayed as a user rating.
- A score orders candidates; it is not a probability of success.
- Recommendations must remain language-aware when connected to a user-facing surface.
- Users cannot directly lower their recommendation target; temporary adjustments come only from recommendation outcomes.
- Conjectures, unrated problems, and problems with difficulty `>= 90` are never candidates.
- User-facing surfaces show problems, never the internal score or confidence.
- Recommendation changes should be checked against real profiles through the shadow endpoint and covered by focused tests.
- Model changes increment `RECOMMENDATION_MODEL_VERSION`.

## Evaluation

Prefer next-day recommendation-open and solve rates, plus explicit too-hard and too-easy feedback. Raw time on site is not
an optimization target. Any future experiment should preserve the no-login-signal rule, the temporary offset cap, and the
candidate eligibility guardrails.
