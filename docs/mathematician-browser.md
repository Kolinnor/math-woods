# Mathematician browser

The browser uses the problem browser's filter layout, live GET parameters and
sort control. By default only the interface language is selected. `languagesSet=1`
distinguishes explicitly unchecking all languages (zero matches) from the default.
Multiple languages select one card per person and never display an unchecked language.

Period presets set the same interval as the two range handles. Ranges match any
overlap with the known lifespan/activity interval, including people born before
the selected period. Presets are browsing conventions: antiquity through 499,
500–1499, 1500–1799, 1800–1949, and 1950 through the current year.
Unknown dates remain in the unfiltered catalogue and sort last chronologically.

Optional `periodStartYear` and `periodEndYear` are shared across translations.
They are known lifetime/activity bounds, not a claim of exact birth/death dates.
A single bound represents that known year only. Negative years mean BCE; there
is no year zero. Existing displayed dates are never rewritten. In the absence
of structured bounds, a conservative parser reads simple legacy date ranges,
single years/floruits, and explicitly living people; ambiguous text remains unknown.

Each translation can specify `sortName`, such as `Noether, Emmy`. Without it,
ordinary multi-part names sort on their last word; single names and names with
recognized particles/locatives keep their displayed order. Editors should supply
a sort key for compound surnames and other exceptions. Searching still uses the
existing name/alias/introduction matcher and relevance ordering.

Contribution checkboxes are ORed within their group, then ANDed with language,
period and text. Awaiting review includes pending entries and published entries
changed since review. Stub detection is shared with the detail page. Pending
entries are only exposed to their author or authorized reviewers.

Pagination and the detail-page return link retain filters. The sort control's
default remains `newest` for problems; this browser explicitly sets `alphabetical`.
Tests: `test:mathematician-names`, `tests/mathematician-browser.browser.mjs`.
The migration test can use `MW_PGLITE_MODULE` with an isolated PGlite installation.
