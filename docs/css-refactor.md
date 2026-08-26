# CSS refactor

## Stable starting point

The production site before the refactor is commit `e382913`, marked by the
annotated tag `stable-before-css-refactor-2026-08-26`.

This tag means: the site works, and the structural CSS refactor starts here.
It is a recovery point, not a claim that every page is free of existing bugs.

## Invariants

- The desktop appearance must not change during structural refactor commits.
- Desktop reference widths are 1440 and 1920 pixels.
- Mobile reference widths are 390 and 430 pixels.
- The existing cascade order must be preserved during the initial file split.
- Cleanup and mobile redesign must not happen in the same commit.
- Shared abstractions are introduced only after duplicate behavior is identified.
- `app/globals.css` should eventually contain only tokens, foundations, and truly global rules.

## Verification

Run the core checks and the visual suite before and after each refactor batch:

```sh
npm run test:core
npm run build
npm run test:visual
```

The visual suite targets `https://mathwoods.org` by default. It keeps the
production content but replaces its stylesheets in the browser with the CSS
emitted by the local production build. This allows structural CSS work to be
checked without connecting a local app to production data. To compare a local
or preview deployment instead, set `VISUAL_BASE_URL` to that deployment's origin.

The frozen screenshots remain a human-readable archive of the starting point.
`npm run test:visual:reference` compares the live site with those files, but it
may differ when editorial content or its ordering has legitimately changed.

Create or deliberately refresh the reference images only from the stable site:

```sh
npm run test:visual:update
```

## Refactor order

1. Capture the public reference pages.
2. Split the global stylesheet while preserving source order exactly.
3. Consolidate the homepage and navigation rules.
4. Consolidate problem browsing and problem detail rules.
5. Consolidate concepts, editors, discussions, profiles, and contribution tools.
6. Remove confirmed dead selectors and obsolete preview-only styles.
7. Define the responsive contract used by the future mobile interface.

## Current progress

- `app/globals.css` contains only tokens and global foundations.
- The former global stylesheet is split into ordered feature stylesheets.
- Obsolete homepage styles and the unused `HomeGuestIntro` component are removed.
- Public problem browsing, recommendations, and problem detail styles now live in
  `app/styles/64-problems.css` instead of being distributed across eight files.
- Public concept browsing, reading, sharing, and practice styles now live in
  `app/styles/65-concepts.css` instead of being mixed into layout and browser files.
- Public user directories, profiles, avatars, and mathematician styles now live in
  `app/styles/66-community.css` instead of being mixed into compatibility and browser files.
- Contribution requests, work queues, and site improvement styles now live in
  `app/styles/67-contributions.css` instead of compatibility and exploration files.
- The visual suite compares eleven public pages at two desktop and two mobile
  widths, for 44 local-versus-production checks.
- Remote images are decoded before capture, and binary screenshot differences
  fail with a concise message instead of serializing entire PNG buffers.

## Current inventory

- `app/globals.css`: 22,533 lines and 3,371 rules at the starting point.
- 2,965 unique selectors.
- 301 selectors occur more than once, for 406 additional rule occurrences.
- CSS Modules are currently used only by JSXGraph Studio.
