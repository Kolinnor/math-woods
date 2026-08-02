<p align="center">
  <img src="./public/icon.svg" width="88" alt="Math Woods logo">
</p>

<h1 align="center">Math Woods</h1>

<p align="center">
  <strong>The Free Math Knowledge Graph.</strong><br>
  An open-source, community-curated collection of mathematical problems, exercises, concepts, and explorations.
</p>

<p align="center">
  <a href="https://mathwoods.org"><strong>Visit Math Woods</strong></a>
  &nbsp;·&nbsp;
  <a href="./CONTRIBUTING.md">Contribute</a>
  &nbsp;·&nbsp;
  <a href="./LICENSING.md">Licensing</a>
</p>

![A forest painted by Ivan Shishkin](./public/art/morning-in-a-pine-forest.jpg)

> [!IMPORTANT]
> The software is available under [AGPL-3.0-or-later](./LICENSE). Public educational content is available under
> [CC BY-NC-SA 4.0](./CONTENT_LICENSE.md) unless a page states otherwise. The Math Woods name and official visual
> identity are governed by the [Brand Policy](./TRADEMARK.md). The complete overview is in
> [LICENSING.md](./LICENSING.md).

## About Math Woods

Math Woods is a place for reading, writing, and solving mathematics together. Problems are organized by domain and
difficulty, concepts form a network of linked pages, and exercises give readers a direct way to practise an idea they
have just encountered. Everything is free to read, without advertising or subscriptions.

The project takes inspiration from the collaborative editing of Wikipedia, the mathematical conversations of Math
StackExchange, the connected notes of Obsidian, and the quiet focus of lichess. It is still growing, and its shape is
guided by the people who use it to learn, explain, review, and explore mathematics.

## What you can do

### Solve and discuss

The problem browser supports mathematical domains and subdomains, difficulty levels, exercises, translations, and
personal progress. A problem can collect hints, solutions, discussions, reactions, related problems, and editorial
review. Recommendations and friendly challenges help readers find a useful next problem without turning mathematics
into an attention contest.

### Build the knowledge graph

Concept pages connect mathematical definitions and ideas through wiki-style links, aliases, backlinks, translations,
and revision history. Curated exercises can be attached to a concept so that reading can lead naturally into practice.

### Write interactive explorations

Explorations are visual, branching mathematical stories built from blocks. Authors arrange text, concepts, problems,
choices, and quizzes on a canvas, then connect them into paths that respond to the reader's answers.

### Contribute with other people

Math Woods includes public profiles, attributed revisions, review tools, notifications, friendships, private chat, and
moderation. Contributors can sign in with Google, GitHub, ORCID, or a Math Woods account. Mathematical writing remains
the center of the experience; the social tools are there to make collaboration easier.

## Running Math Woods locally

Math Woods uses Node.js 22 and PostgreSQL. Docker is the simplest way to start the local database.

```bash
git clone https://github.com/Kolinnor/math-woods.git
cd math-woods
cp .env.example .env
docker compose up -d
npm install
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On Windows, use `npm.cmd` when PowerShell prevents the `npm`
wrapper from running.

External login providers, email delivery, Redis-compatible rate limiting, and object storage are optional during local
development. Their environment variables are documented in [`.env.example`](./.env.example). Never commit a real
`.env` or `.env.production` file.

## Development

The application is built with Next.js 15, React 19, TypeScript, Prisma, and PostgreSQL. CodeMirror powers the
Markdown/LaTeX editor, KaTeX renders mathematics, JSXGraph supports interactive figures, and React Flow powers the
exploration canvas. Production runs in Docker with Caddy, Valkey, and automated PostgreSQL backups.

Before opening a pull request, run the same checks used for substantial local changes:

```bash
npx tsc --noEmit
npm run test:core
npm run build
```

The editor has a history of delicate edge cases around live LaTeX, selections, links, lists, and display mathematics.
Please read [`docs/editor-regressions.md`](./docs/editor-regressions.md) before changing it. The production setup is
documented separately in [`deploy/INFOMANIAK.md`](./deploy/INFOMANIAK.md).

## Contributing

There are many useful ways to take part: write or translate mathematical content, improve a proof, review a page, report
a bug, refine the interface, or contribute code. The site records authorship and revision history so that changes can be
discussed and understood.

Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before submitting work. Only contribute material you wrote, material
in the public domain, or material you have permission to publish under the relevant Math Woods license. Sources and
adaptations should be identified clearly.

Math Woods was developed with assistance from AI coding tools under human direction and review. Responsibility for
the published project remains human.

## Licensing and credits

The application code is licensed under the [GNU Affero General Public License v3.0 or later](./LICENSE). Educational
content uses [CC BY-NC-SA 4.0](./CONTENT_LICENSE.md) by default. Forks should use their own name and visual identity in
accordance with the [Brand Policy](./TRADEMARK.md).

Forest paintings used by Math Woods are works by Ivan Shishkin (1832-1898), in the public domain. Default avatar
illustrations come from AsIan's *Animal Outlined Sepia Icons* collection under CC BY 4.0. Third-party notices and
attribution guidance are collected in [`NOTICE`](./NOTICE).
