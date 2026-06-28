# Math Woods Permissions

Math Woods keeps the technical Prisma role `MODERATOR`, but the user-facing label is **Trusted user**.

## Role Levels

- `USER`: regular verified contributor. May create and maintain their own work.
- `MODERATOR`: trusted editorial user. May edit/restore/review public content, but is not an administrator.
- `ADMIN`: site administrator. May archive problems, delete playlists, manage trusted users, and use admin moderation powers.
- `OWNER`: final site owner. May assign admins and perform owner-only actions.

Unverified users are not a separate role. Email verification is a contribution gate; trusted users, admins, and the owner bypass it.

## Main Rules

- Problems: authors and trusted roles may edit; only admins and the owner may archive/delete problem pages.
- Problem quality: regular users may leave work unreviewed or mark it as needs work; trusted users may mark good; admins and owner may mark excellent.
- Solutions: authors and trusted roles may edit or delete solutions.
- Concepts: creators and trusted roles may edit; trusted users may set editorial statuses except excellent; admins and owner may set excellent.
- Playlists: authors and trusted roles may edit; authors, admins, and owner may delete.
- Discussion hints: authors and trusted roles may edit/delete; problem authors, hint authors, and trusted roles may reveal hints without an attempt.
- Verification reviews: problem authors and trusted roles may review or join private verification discussions.
- Role management: admins may manage users and trusted users; only the owner may assign admin.

Route names, database models, and old technical identifiers may still contain `proof` or `MODERATOR` for compatibility.
