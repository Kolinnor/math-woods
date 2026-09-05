# Problem domain taxonomy — 2026-09-05

Based on Thomas Lejeune's PR #7, commit `d3d6117d8b1746dae06bb707c1bbc391c1c614ca`.
This integration covers domains only; concept usefulness votes and concept content
templates are not included.

## Compatibility

- Existing stored codes remain selectable or resolve through aliases. No data
  migration is needed: filters expand aliases and form parsing normalizes them
  when a contributor saves an edit. Spoiler flags follow the normalized code.
- Representation theory remains a subdomain of algebra. Scientific computing and
  mathematical physics remain distinct subdomains of applied mathematics.
- Algebraic geometry remains a top-level domain.
- `other` remains the default Other category. Applied mathematics uses the new
  `applied-mathematics` code; `misc` is an alias of `other`.
- The old category-theory, general-topology and differential-geometry subdomain
  codes become aliases of their corresponding parent. The old ordinary differential
  equations code aliases `differential-equations-ordinary`.
- `topology-algebraic-topology` and `discrete-mathematics-combinatorics` alias
  `algebraic-topology` and `combinatorics`. MSC 01 moves to history of mathematics.
- Domain tile progress and problem/exercise counts aggregate under the current
  parent so categories moved into subdomains remain counted.
- Hero images reuse existing assets; see `domain-hero-art.md`.

`tests/fixtures/problem-domains-before-pr7.json` records the previous codes and
aliases independently of the new implementation. Core tests check their parsing,
filter inclusion, editable spoiler flags, visible parents and translated labels.
