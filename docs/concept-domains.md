# Concept domains

Concepts use the same domain picker and limit as problems: one to three domains, including subdomains. In the concept editor, selected domains appear in order; clicking one promotes it to the primary position.

`Concept.domainCodes` stores the ordered list. `domainCode` and the coarse `domain` remain synchronized with its first item for existing consumers. Migration `20261107140000_concept_domains` backfills the array from the existing primary domain and adds a GIN index. Apply it before starting the updated application.

All selected domains appear on the concept and in list/search results. List filters match primary or secondary domains, including children of a selected parent. The map keeps one node per translation family, positioned and colored by its primary domain. Any selected domain can make that node visible; domain counts include each membership and the total avoids double-counting. Map memberships use top-level domains, as before.

Domains are shared across translations. Edits, proposals, approval, family linking, revision snapshots and rollback carry the ordered list. Old forms only change the primary domain and preserve secondary domains. Old revisions without this field do not invent historical secondary domains; the latest revision is completed before the first new edit so that change can be reverted. Markdown exports include the ordered canonical codes under `domains`, and imports accept them or the legacy `domain` field.

Regression coverage: `tests/concept-domains.test.mjs` exercises validation, real save/proposal/approval/rollback actions, translation synchronization, map membership and the migration. `tests/concept-pagination.test.mjs` exercises the actual list page with secondary-domain filters. Migration tests run when `MW_PGLITE_MODULE` points to the installed PGlite module.
