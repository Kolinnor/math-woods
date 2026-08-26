# CSS refactor

## Stable starting point

The production site before the refactor is commit `e382913`, marked by the
annotated tag `stable-before-css-refactor-2026-08-26`.

This tag means: the site works, and the structural CSS refactor starts here.
It is a recovery point, not a claim that every page is free of existing bugs.

## Invariants

- The desktop appearance must not change during structural refactor commits.
- Desktop reference widths are 1440 and 1920 pixels.
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

1. Capture the public desktop reference pages.
2. Split the global stylesheet while preserving source order exactly.
3. Consolidate the homepage and navigation rules.
4. Consolidate problem browsing and problem detail rules.
5. Consolidate concepts, editors, discussions, profiles, and contribution tools.
6. Remove confirmed dead selectors and obsolete preview-only styles.
7. Define the responsive contract used by the future mobile interface.

## Current inventory

- `app/globals.css`: 22,533 lines and 3,371 rules at the starting point.
- 2,965 unique selectors.
- 301 selectors occur more than once, for 406 additional rule occurrences.
- CSS Modules are currently used only by JSXGraph Studio.
