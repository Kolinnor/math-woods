# Site improvements board

The site improvements board lives under **Work to do** at `/contributing/tasks/site-improvements`.

## Access

Only trusted users (`MODERATOR`) and higher roles (`ADMIN`, `OWNER`) may see the tab, load board or detail pages, or
invoke its server actions. Hiding the tab is only a convenience: every page and mutation calls `requireModerator()`.

## Workflow

An improvement moves through four lists:

1. `BACKLOG`: worth considering, but not yet scheduled;
2. `PLANNED`: accepted as upcoming work;
3. `IN_PROGRESS`: actively being handled;
4. `COMPLETED`: finished and retained for reference.

Priorities are deliberately small in number: low, normal, and high. They order cards within each list but do not grant
permissions or automatically change status.

Any trusted user may create an improvement, change its status or priority, and participate in its discussion. An
unassigned improvement can be claimed atomically, preventing two users from taking it at the same time. Claiming moves
it to `IN_PROGRESS`. The assignee, an admin, or the owner may release it; releasing active work moves it to `PLANNED`.
Completed items retain their assignee as useful historical context.

The creator may correct the title or description after creation; admins and the owner may do the same. These edits are
recorded in the activity history. Other trusted users can propose wording or scope changes in the discussion.

## Data and history

Descriptions and discussion messages are stored as sanitized rendered Markdown together with their Markdown source.
Creators, assignees, and comment authors use nullable relations so the board remains intelligible after account deletion.
Deleting an improvement cascades to its comments and activity, although no deletion control is exposed in the interface.

`SiteImprovementActivity` records creation and every status, priority, or assignee transition. The detail page shows the
latest 60 activity entries, while all entries remain in the database. Discussions are chronological and immutable in the
initial version, which keeps decisions auditable and avoids silent rewriting.
