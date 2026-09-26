# Concept map

For admins and the owner, `/concepts` opens on an interactive map of the concept pages and their
citations, inspired by Obsidian's graph view. The notice above it reads **Accessible seulement aux
admins** (English: **Accessible to admins only**). Everyone else keeps the classic **List** view,
with no Map/List switch. An explicit map URL or a remembered map cookie cannot bypass this rule.

A line on the map means that one page *cites* the other (`[[…]]` in its text), not necessarily that
it is a prerequisite. The map shows no legend: colors are the domain colors, and the side panel
spells out what a concept cites and what cites it.

## Views and memory

- `?view=map` or `?view=list` chooses the view explicitly (shareable links, works without JavaScript).
- Otherwise the `math-woods-concepts-view` cookie (one year) remembers the last choice made with the
  Map/List switch; opening an explicit `?view=` link does not change it.
- Without either, the map is shown to admins/owner; other readers always see the list.
- Going back to the list restores the filters LiveSearchForm remembered for the tab
  (`math-woods:filters:concepts`), except the page number.
- The map view runs none of the list queries. The page renders the map frame (search, buttons,
  panels) at once and asks the browser to preload the first tier of data
  (`preload(…, { as: "fetch" })` from `react-dom`), so the request starts with the HTML.

Resolution lives in `lib/concept-browser-view.ts`; the switch is `components/ConceptBrowserViewSwitch.tsx`.

## Which concepts and links are shown

Built by `lib/concept-map.ts` from `Concept`, `ConceptAlias`, `ConceptRedirect` and `InternalLink`.

- **Only the pages of the selected language.** The French map holds the French pages, the English
  map the English pages; there is no fallback to another language. A concept without a page in the
  reader's language is not on that map. Links open the page with `?viewLanguage=` of the map.
- **Visibility.** Pages with status `MISSING` and pages in a non-active language are never shown, as
  in the sitemap, the random concept and the public statistics. `canAppearInConceptBrowser` only
  means "featured" and does not hide a concept. The graph data is shared internally across admins,
  but its API checks the session and admin/owner role before every response, including `304`.
- **Links.** Only `InternalLink` rows whose source is a concept page of that language
  (`sourceType = CONCEPT`). Problems, solutions and explorations are not part of this map.
- **Target resolution** mirrors what a reader reaches by following the link on `/concepts/[slug]`:
  rename redirect (`isRename`), then live slug, then alias, then merge redirect. The stored `exists`
  flag is not trusted. When the target is another translation (a French page linking to an English
  slug), the line goes to the page of the same concept in the map's language, if there is one.
- **Merging.** Citations between the same two pages coming through aliases or redirects count once;
  a page citing itself through a sibling translation is ignored. Direction is kept: the panel lists
  "Cites" and "Cited by" separately. Titles of the other translations and the aliases are only used
  by the search, so that "compactness" also finds "Compacité".

## Scaling to tens of thousands of concepts

Drawing every dot and every title of a 50,000-concept map at once is neither readable nor fast. The
map works like a geographic map:

1. **Levels of detail** (`conceptMapLevels`). The plane is divided into a grid that doubles in
   resolution at each level; each cell keeps its most important concepts (being cited counts twice
   as much as citing). Level 0, the whole map, holds at most 1,500 concepts whatever the size of the
   map; every concept appears at the last level. A map of up to 1,500 concepts has a single level,
   so today's map is drawn whole at every zoom, as before. The renderer shows the levels allowed by
   the camera zoom and keeps the selected concept, its neighbors and search hits visible at any zoom.
2. **Data in tiers** (`/api/concepts/map?lang=…&tier=n`). Tier 1 holds the overview (whole levels,
   within 3,000 concepts); every following tier holds one level. A link comes with the later of its
   two ends, so the loaded concepts always have all their links. Large screens load the other tiers
   one by one while the browser is idle; phones load one zoom step ahead of the camera, and
   everything as soon as the search is used, a concept is selected or a `#concept=` link needs it.
3. **Density-aware drawing.** The levels keep about the same number of dots on screen at every
   zoom, so dots and lines are sized for that density: they are smaller and lighter on a dense map
   (and on a phone), and only grow when zooming beyond the last level.
4. **Server work in small slices.** Loading the rows (in batches of 10,000), building the graph, the
   layout, the levels and the payloads all run in slices of about 8 ms between other requests.

Next steps if the map grows well beyond 50,000 concepts, not implemented yet:

- store the positions in a table computed by a background job (or a `worker_threads` worker), so that
  a restart or a second app instance reuses them instead of recomputing them;
- serve deep levels by viewport tiles instead of whole levels, and move the map search to the server,
  so that a phone never needs the whole map.

## Layout: precomputed on the server, stable, cached

`lib/concept-map-layout.ts`. Nothing is simulated in the browser.

1. **Skeleton.** The 2,500 most important concepts (all of them on smaller maps) run through
   ForceAtlas2 (Barnes–Hut above 250). Each domain (top-level entry of `PROBLEM_DOMAINS`, in its usual
   order so that families are contiguous) has a fixed invisible anchor on a ring; concepts are tied to
   their domain anchor by a weak spring and to each other by their citations. Initial positions come
   from a hash of the translation group, so **the same graph always gives the same map**, whatever the
   order of the database rows (tested).
2. **Everything else** (large maps only). The skeleton is spread to the density of the whole map,
   then every other concept is placed round after round next to the concepts it is linked to
   (sunflower pattern around its most important placed neighbor); unconnected concepts join their
   domain. The cost of step 1 is bounded, so the layout stays linear in the size of the map.
3. **Overlaps** are removed on a spatial grid (same idea as `graphology-layout-noverlap`, linear and
   sliceable). Coordinates are normalized to about ±1000.

- Positions depend only on the structure of the map of a language (its pages, their domains and
  the undirected links), never on titles or statuses. Each language has its own layout.
- `lib/concept-map-data.ts` checks a cheap "stamp" of the tables (counts, latest ids and update
  date) at most every 15 seconds and only re-reads the rows when it changes, so an edit appears within
  about 15 seconds without any hook in the editing actions. The layout is only recomputed when the
  structure changes.
- While a new layout is computed, requests are answered immediately with a **provisional** one
  (known concepts keep their position, new ones appear next to what they cite), served with
  `Cache-Control: no-store` and a distinct version, so that its tiers are never mixed with the final
  ones (a client that notices a version change reloads the first tier).
- `instrumentation.ts` computes the maps of both languages when the server starts, so the first
  visitor does not wait for the layout.

## API

`GET /api/concepts/map?lang=fr|en&tier=1…` returns one tier:

```ts
{
  version: string;                 // structure signature ("~p" suffix while provisional)
  language: string;
  provisional: boolean;
  tier: number;
  offset: number;                  // global index of the first node of this tier
  total: { nodes: number; links: number };
  bounds: { x: [min, max]; y: [min, max] };   // of the whole map
  tiers: { end: number; level: number }[];    // every tier of the map
  maxLevel: number;
  domains: { code, family, color, count }[];
  nodes: {                         // columns, for compact JSON
    slug: string[]; label: string[]; x: number[]; y: number[];
    domain: number[]; status: number[]; kind: number[]; degree: number[]; level: number[];
    title: Record<index, string>;  // Markdown title when it differs from the label
    terms: Record<index, string>;  // aliases and other translations' titles, normalized, for the search
  };
  links: number[];                 // directed citations, flattened pairs of global node indexes
  titleHtml: Record<index, string>; // KaTeX/Markdown titles, only when needed
}
```

`label` is a single-line Unicode approximation of the title for the canvas (`lib/concept-map-text.ts`:
`$\mathbb{Z}/n\mathbb{Z}$` becomes `ℤ/nℤ`, `$L^p$` becomes `Lᵖ`); the side panel shows the real
rendering.

Access: `401` for visitors, `403` for non-admin accounts. Headers: `ETag` (304 on `If-None-Match`
after authorization), `Cache-Control: private, no-store`, `Vary: Cookie, Accept-Encoding`.
The in-process server cache is retained. Next does not compress this response itself; Caddy's `encode zstd gzip`
does in production.

## Client

`components/ConceptMap.tsx` (frame, search, filters, panel, accessibility, tiers) and
`components/concept-map-renderer.ts` (Sigma), loaded with a dynamic `import()` only on the map.

- **Immediate frame**: the map area, search field, buttons and panels are in the server HTML; the
  WebGL code and the first tier load in parallel. A thin progress line appears at the top of the map
  only if the data takes more than 0.6 s; the dots fade in when ready.
- **Rendering**: Sigma.js 3 (WebGL) with a Graphology graph. Colors are the domain family colors of the
  problem domains, on the cream and forest palette; stubs are paler. Dot size grows with the number of
  linked concepts.
- **Progressive titles**: the overview only names up to six well-spaced domains (three on a narrow
  canvas); hovering still reveals any concept. Domain names fade out as concept titles fade in below
  camera ratio 0.7. Intermediate zoom shows up to ten titles, close zoom (ratio below 0.3) up to 24;
  narrow canvases use four and ten respectively. A selection names itself and at most five neighbors
  (three on narrow canvases). Search highlights all matches but labels at most five (three narrow),
  only after zooming in or choosing a result. Sigma's grid proposes candidates and `drawCollectedLabels`
  prioritizes selection, search hits, neighbors and size; extra spacing and collision checks protect
  the other names and overlaid controls. No font size reduction or extra graph refresh is needed for
  these zoom-dependent label budgets.
- **Interactions**: wheel/pinch zoom, drag/touch pan, zoom buttons, "whole map", full screen. Hover or
  selection highlights the concept, its neighbors and their links; the panel lists what it cites and
  what cites it, each item selectable on the map, with an "Open the page" button. Double click (or
  Enter on the focused map) opens the page.
- **Search**: accessible combobox over titles, other translations and aliases, accent-insensitive;
  matches are highlighted, Enter centers the chosen concept and its neighbors. The search index is
  only built on the first search.
- **Domain filters**: one checkbox per domain present, with counts, "show all", "hide all" and "only
  this domain"; hidden domains are also excluded from the search.
- **State**: the selection is kept in the hash (`/concepts#concept=slug`, shareable); the camera is
  kept in `sessionStorage` for the tab, so "Back" from a page returns to the same view.
- **Mobile** (≤ 900 px): the selection opens as a sheet over the bottom of the map; domain filters are
  collapsed below the map; no horizontal scroll.
- `prefers-reduced-motion` removes camera animations.

## Accessibility

- The canvas has `role="application"`, a label with the counts, and a description of the keyboard
  shortcuts (arrows pan, `+`/`−` zoom, `0` whole map, `Escape` clears, `Enter` opens).
- Every concept is reachable without the canvas through the search combobox and the neighbor lists
  (buttons and links); the List view stays one click away.
- Loading, selections and search results are announced in polite live regions.
- Without WebGL, or if the API fails, the map area says so and links to the List view (with a retry
  button on errors).

## Why Sigma.js and Graphology

- WebGL keeps pan and zoom smooth for thousands of nodes and edges, where SVG/DOM solutions such as
  React Flow (already used for the exploration canvas) are meant for tens to hundreds of nodes.
- Sigma provides the camera, touch gestures, picking, reducers for highlighting and a label grid;
  the server layout uses ForceAtlas2 from `graphology-layout-forceatlas2`. All are MIT licensed.
- The ForceAtlas2 iteration is copied in `lib/forceatlas2-iterate.ts` (with its license) instead of
  being imported: `next dev` runs npm modules inside a non-strict `eval()`, where that file's
  constants become slow dynamic lookups, and the layout took about 70 s instead of 2 s for
  10,000 concepts in development. As a strict ES module it runs at the same speed in development
  and production, with identical results (checked value by value).
- Cost: lazily loaded chunks of 96 kB (25.6 kB gzip) for Sigma and Graphology and 8.9 kB (4.1 kB
  gzip) for the renderer; the `/concepts` route has 116 kB of first-load JS (108 kB before the map).
- Alternatives considered: a hand-written Canvas 2D renderer (smaller, but picking, touch and label
  management to rebuild), d3-force in the browser (the continuous simulation the brief excludes) and
  Cytoscape.js (heavier, Canvas renderer).

## Measurements

Local production build (`next build && next start`), cloud sandbox with 2 vCPUs, PostgreSQL 16,
graphs generated by `scripts/concept-map-fixture.mjs` (FR/EN translations, stubs, aliases,
redirects, missing targets, mostly intra-domain citations with preferential attachment). Figures
are for the French map; the fixture gives about 80 % of its concepts a French page.

| Fixture | French pages (citations) | Layout CPU | Longest pause | Concepts per zoom level | Tier 1 (gzip) | All tiers (gzip) |
|---|---|---|---|---|---|---|
| 400 | 333 (575) | 0.29 s | 28 ms | 333 | 40 kB (12 kB) | same |
| 10,000 | 7,912 (12,570) | 2.3 s | 43 ms | 1,488 → 7,912 in 5 levels | 228 kB (51 kB) | 1.2 MB (259 kB) |
| 50,000 | 39,583 (64,378) | 3.1–3.4 s | 50 ms | 1,415 → 39,583 in 6 levels | 229 kB (48 kB) | 6.8 MB (1.3 MB) |

- "Longest pause" is the longest stretch during which the server could not answer another request
  while computing the map (the old single-pass version reached 146 ms at 5,000 concepts, and about
  1 s at 8,000 because of the overlap removal).
- While both maps of the 50,000 fixture were computed at server start, `/api/health` answered in
  7 ms (median), 50 ms (95th percentile), 121 ms at most; 38 ms and 67 ms at 10,000.
- A cached tier is served in 4–10 ms, a `304` in about 5 ms.
- `npm run dev` with the 10,000 fixture and an empty `.next` cache: the server answers after about
  12 s (compilation) and the map is already computed when `/concepts` is first opened.
- Browser, headless Chromium with **software** WebGL (SwiftShader), 50,000 fixture: the map frame is
  on screen about 0.5 s after navigation whatever the size; the first tier is drawn after 2 s, half
  of which is spent by SwiftShader creating the WebGL contexts and compiling shaders. Adding a later
  tier takes 50–95 ms of main thread at 10,000 concepts and 200–300 ms at 50,000, one tier at a time.
  A phone-sized viewport only loaded tiers 1 and 2 (0.9 MB before compression) until it zoomed in or
  searched. Frame rates are dominated by software rasterization and `readPixels` (Sigma's picking) in
  this sandbox, so they were not used as a target; they remain to be checked on real GPUs.

Reproduce:

```sh
node scripts/concept-map-fixture.mjs --concepts 10000   # local database only; --clean removes it
node --experimental-strip-types scripts/concept-map-benchmark.mjs --lang fr
```

## Tests

- `tests/concept-map.test.mjs` (in `test:core`): labels and search normalization, Map/List
  resolution, one map per language (no page of another language, citations of that language only),
  aliases, rename and merge redirects, hidden concepts, citation direction and deduplication, levels
  of detail, tiers (whole levels, every link exactly once), determinism and slicing (also beyond the
  skeleton), stability after an edit, provisional layout, server cache (one layout per language and
  structure, warm-up, stamp, provisional answer then full layout, warm-up without database).
- `tests/concept-pagination.test.mjs`: the list still pages every match once; the map is the default,
  runs no list query and preloads its first tier; the cookie and `?view=` choose the view.
- `npm run test:concept-map:browser`: the real components in Chromium with WebGL, on desktop and on a
  phone viewport (frame shown before the data, tiers loaded in order and only for the page's
  language, search, keyboard, canvas click and double click, neighbors, filters, hash links including
  a concept of the last tier, French map, reload after a tier of a newer map, retry after an error,
  no-WebGL message, bottom sheet, tiers on zoom and search on a phone, remembered switch). Set
  `CONCEPT_MAP_CHROMIUM` to an installed Chromium if Playwright's own build is not downloaded.

## Limits and possible follow-ups

- The layout cache lives in the memory of the Node process: a restart recomputes it at start-up
  (0.3 s today, about 10 s for both languages at 50,000 concepts), and several app instances would
  each compute it. See "Next steps" above.
- Any edit of a concept, alias, redirect or link re-reads every row of these tables (in batches);
  at 50,000 concepts that is about a second of database time per change.
- Direction is not drawn on the canvas (a single line for one or two citations); it is in the panel.
- Canvas titles are Unicode approximations: some LaTeX (fractions, nested scripts) stays readable but
  not typeset.
- The map search covers titles, translations and aliases, not the concept text (the List search does).
- Only Chromium was exercised in this environment; WebKit/Safari and Firefox, and frame rates on real
  GPUs and phones, remain to be checked by hand.
