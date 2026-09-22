# Problem reference search

The problem browser, its advanced Origin/Text filters and global search include
structured citations: text, locator, note, and the linked public reference's title,
authors, aliases and translated titles. No title or citation data is rewritten.
For older problems with no structured citations, origin, chapter, page and note
remain searchable. Structured citations take precedence so stale legacy text cannot
disclose a citation subsequently marked as a spoiler.

`matchingProblemReferences` searches in PostgreSQL and returns one matching citation
per problem. Its IDs join the existing query **before** filtering, translation
grouping and pagination. The result line uses only an authorized matching citation.
All words may occur in different fields of the same citation, in any order; they
must not be assembled from unrelated citations. Accents and punctuation are folded.
Numeric tokens match whole words (24 does not match 241). Roman numeral equivalents
are recognized after locator words such as Livre, Book, Proposition and Chapter.
The advanced “is exactly” operator retains exact field matching.

Spoiler citations are excluded in SQL unless the viewer is the problem author, a
trusted moderator/admin/owner, or has solved a translation in the same group. Draft,
unlisted and archived problems cannot match; unpublished/non-searchable library
metadata is never joined. Public citation text remains searchable independently.

Regression coverage: `npm run test:bibliography`. To execute PostgreSQL-backed
cases as well, set `MW_PGLITE_MODULE` to a local installation's
`@electric-sql/pglite/dist/index.js`. Page tests verify pagination, language grouping,
the reference line and existing filters using the actual page functions.
