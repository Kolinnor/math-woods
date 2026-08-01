# Recommendation foundation

Math Woods recommendations optimize for a useful next mathematical step, not time spent on the site.

## Current scope

The model powers the recommendation cards on the home page, the recommendation reader in the problem browser, and the
next-problem card shown after a solve. Admins can still inspect its full scoring breakdown through:

`GET /api/recommendations/shadow?username=USERNAME&limit=20`

Scores are computed on demand from existing data and are not persisted. This avoids stale profiles and lets the model
change without database migrations.

## Inputs

- declared mathematics level;
- declared mathematical domains;
- deduplicated attempts across translations;
- solved, blocked, started and review-later states;
- favorites and explicit post-solve reactions;
- problem difficulty, domain, quality, type and publication date.

The model does not track page impressions, dwell time, clicks, cursor activity or inferred abandonment.

## Profile

The internal profile contains a target difficulty, its confidence, and domain affinities with separate evidence and
confidence values. These are estimates for ranking content, not measures of a person's worth or mathematical ability.

## Candidate score

Each user-problem pair receives explainable components for difficulty fit, domain relevance or discovery, review status,
resuming an attempt, favorites, exercise suitability for introductory levels, and freshness. Difficulty reactions
adjust the target difficulty; more/less-like-this reactions adjust domain affinities.

Solved translation groups and problems authored by the user are excluded. Recent blocked attempts are temporarily
penalized rather than interpreted as permanent dislike.

## Guardrails

- The score is internal and must not be displayed as a user rating.
- A score orders candidates; it is not a probability of success.
- Recommendations must remain language-aware when connected to a user-facing surface.
- User-facing surfaces show problems, never the internal score or confidence.
- Recommendation changes should be checked against real profiles through the shadow endpoint and covered by focused tests.
- Model changes increment `RECOMMENDATION_MODEL_VERSION`.
