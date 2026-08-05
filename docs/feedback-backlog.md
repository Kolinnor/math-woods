# Math Woods feedback backlog

Living checklist distilled from the user test report received on 2026-08-04. This is
not a transcript: items already addressed by the current site are separated from
work that still needs verification or a product decision.

## Status key

- [ ] Open
- [x] Addressed in the current site
- `VERIFY` Reproduce against the current production build before changing code
- `PRODUCT` Agree on the behavior before implementation
- `LATER` Valuable, but not part of the next maintenance batch

## Next maintenance batch

- [ ] **P2 - Allow users to change their email address safely.** Require recent
  authentication, verify the new address before replacing the old one, reject an
  address already attached to an active account, and notify the old address after
  the change. Cover password, OAuth-only, and deleted-account cases.

## Product backlog

- [ ] **P2 - `PRODUCT` Preview linked concepts without leaving a problem.** Explore
  a small hover/focus card containing the concept name and a short definition.
  It must be keyboard accessible, have a sensible mobile tap behavior, and avoid
  loading a full concept page for every link.
- [ ] **P3 - Add clearer level guidance to problems.** Reuse the existing broad
  Math Woods levels where possible. Keep academic level separate from difficulty:
  an elementary prerequisite does not imply an easy problem, and a hard problem
  is not automatically graduate-level. Prefer an optional recommended level and
  prerequisite concepts over a mechanical `34/100 = L2` conversion.
- [ ] **P3 - `PRODUCT` Translation-assisted drafts.** Let an automatic translation
  create a private draft while preserving LaTeX, wiki links, names, and references.
  Label it as machine translated until a human reviews it, and flag it as stale
  when the source changes. Do not silently publish translations as reviewed text.
- [ ] **P3 - `LATER` Pilot one guided worked exercise.** Build one complete path
  from course reminder and intuition through examples, counterexamples, hints and
  a detailed solution. Compose it from the existing concept, exercise, hint,
  solution, and exploration systems before considering a separate course section.
- [ ] **P4 - `LATER` Optional problem-of-the-day email.** Consider a daily or weekly
  opt-in email only after notification preferences, unsubscribe behavior, and email
  delivery costs are defined. The web problem of the day already covers the core
  request.

## Already addressed

- [x] The anonymous mobile journey was audited in production at 320 px and 390 px
  across the home page, problem browser, a reviewed problem, and an unreviewed
  problem. Direct routes remain available, the mobile navigation is usable, and no
  page creates horizontal scrolling. The guest-home footer now wraps its navigation
  instead of clipping `Legal & brand` at the narrowest width.
- [x] Signed-out visitors can open unreviewed problems. The current visibility
  policy no longer hides them from the problem browser or direct problem routes.
- [x] The home page has a curated problem of the day.
- [x] Signed-in users receive personalized recommendations, and solved problems are
  excluded from the main recommendation candidates.
- [x] User rankings include problem creation and problems selected as problem of
  the day.
- [x] Problems support hidden hints.
- [x] Concept links are present in mathematical text.
- [x] The guest home page now has an explicit sign-in button alongside its primary
  actions. The navigation sign-in action and delayed progress reminder remain
  available as secondary entry points.
- [x] Problem-browser content and language checkboxes have an explicit 1 rem square
  size, overriding the generic full-width input rule that made them grow during
  responsive resizing. Labels remain wrapping flex pills.
- [x] Exercises, concept practice queues, detailed solutions, and explorations now
  cover important parts of the requested learning-path system.

## No separate task for now

- **"Most popular problem" on the home page:** the curated problem of the day and
  personalized recommendations are a better fit for Math Woods than another
  engagement-ranked surface. Revisit only if users still cannot find active content.
- **Recommendation algorithm:** it already exists. Future work should evaluate its
  outcomes rather than add another recommendation widget.
- **Old anonymous 404 report:** keep it in regression coverage, but do not reopen it
  as an implementation task unless it can be reproduced on the current build.

## Product qualities to preserve

- The quality and mathematical interest of the curated problem collection.
- The problem of the day and restrained personalized recommendations.
- Hints that remain hidden until a reader asks for them.
- Links between problems and concepts.
- Human mathematical review for published translations and pedagogical content.

## Review routine

When working from this file:

1. Reproduce `VERIFY` items before editing code.
2. Move completed work to **Already addressed** with one sentence describing the
   shipped behavior.
3. Add newly reported feedback with a priority and an observable completion rule.
4. Revisit `PRODUCT` items before implementation if the surrounding feature has
   materially changed.
