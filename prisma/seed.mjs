import { PlaylistNodeKind, PrismaClient, SourceType, TargetType } from "@prisma/client";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import katex from "katex";
import { marked } from "marked";

const prisma = new PrismaClient();
const DIFFICULTY_TAG_SLUGS = [
  "easy",
  "facile",
  "beginner",
  "debutant",
  "intermediate",
  "medium",
  "moyen",
  "hard",
  "difficult",
  "difficile",
  "advanced",
  "expert",
  "l1"
];

function slugify(input) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function extractWikiLinks(markdown) {
  const links = [];
  const seen = new Set();
  const pattern = /\[\[([^\]\n]+)\]\]/g;
  const excluded = findMarkdownCodeRanges(markdown);

  for (const match of markdown.matchAll(pattern)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    if (overlapsRanges(from, to, excluded)) continue;

    const [targetPart, labelPart] = match[1].split("|", 2);
    const targetSlug = slugify(targetPart.trim());
    const label = (labelPart ?? targetPart).trim();
    const key = `${targetSlug}\u0000${label}`;

    if (!targetSlug || seen.has(key)) continue;
    seen.add(key);
    links.push({ targetSlug, label });
  }

  return links;
}

function simpleHtml(markdown) {
  return markdown
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
    .join("\n");
}

function isEscaped(text, position) {
  let backslashes = 0;
  for (let index = position - 1; index >= 0 && text[index] === "\\"; index -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function overlapsRanges(from, to, ranges) {
  return ranges.some((range) => from < range.to && to > range.from);
}

function containingRange(position, ranges) {
  return ranges.find((range) => position >= range.from && position < range.to);
}

function findFenceRanges(text) {
  const ranges = [];
  const openingPattern = /(^|\n)([ \t]{0,3})(`{3,}|~{3,})[^\n]*(?:\n|$)/g;

  for (const match of text.matchAll(openingPattern)) {
    const lineBreakPrefix = match[1] ?? "";
    const from = (match.index ?? 0) + lineBreakPrefix.length;
    if (overlapsRanges(from, from + match[0].length - lineBreakPrefix.length, ranges)) continue;

    const fence = match[3];
    const fenceChar = fence[0];
    const closingPattern = new RegExp(
      `(^|\\n)[ \\t]{0,3}\\${fenceChar}{${fence.length},}[ \\t]*(?=\\n|$)`,
      "g"
    );
    closingPattern.lastIndex = from + match[0].length - lineBreakPrefix.length;
    const closing = closingPattern.exec(text);
    const to = closing ? (closing.index ?? 0) + closing[0].length : text.length;

    ranges.push({ from, to });
  }

  return ranges;
}

function findInlineCodeRanges(text, fences) {
  const ranges = [];

  for (let position = 0; position < text.length; position += 1) {
    const fence = containingRange(position, fences);
    if (fence) {
      position = fence.to - 1;
      continue;
    }

    if (text[position] !== "`") continue;

    let tickCount = 1;
    while (text[position + tickCount] === "`") tickCount += 1;

    const delimiter = "`".repeat(tickCount);
    const closing = text.indexOf(delimiter, position + tickCount);
    const newline = text.indexOf("\n", position + tickCount);
    const fallbackTo = newline === -1 ? text.length : newline;
    const to = closing === -1 || (newline !== -1 && newline < closing) ? fallbackTo : closing + tickCount;

    ranges.push({ from: position, to });
    position = to - 1;
  }

  return ranges;
}

function findMarkdownCodeRanges(text) {
  const fences = findFenceRanges(text);
  return [...fences, ...findInlineCodeRanges(text, fences)].sort((left, right) => left.from - right.from);
}

function isInlineDollarOpen(text, position) {
  const next = text[position + 1];
  return Boolean(next && !/\s/.test(next));
}

function isInlineDollarClose(text, position) {
  const previous = text[position - 1];
  const next = text[position + 1];

  if (!previous || /\s/.test(previous)) return false;
  return !next || !/[A-Za-z0-9]/.test(next);
}

function delimiterAt(text, position) {
  if (text.startsWith("\\(", position) && !isEscaped(text, position)) {
    return { close: "\\)", formulaFrom: position + 2, displayMode: false, singleLine: true };
  }

  if (text.startsWith("\\[", position) && !isEscaped(text, position)) {
    return { close: "\\]", formulaFrom: position + 2, displayMode: true, singleLine: false };
  }

  if (text.startsWith("$$", position) && !isEscaped(text, position)) {
    return { close: "$$", formulaFrom: position + 2, displayMode: true, singleLine: false };
  }

  if (text[position] === "$" && !isEscaped(text, position) && isInlineDollarOpen(text, position)) {
    return { close: "$", formulaFrom: position + 1, displayMode: false, singleLine: true };
  }

  return null;
}

function findClosingDelimiter(text, delimiter) {
  let closing = delimiter.formulaFrom;

  while (closing < text.length) {
    if (delimiter.singleLine && text[closing] === "\n") return -1;

    if (text.startsWith(delimiter.close, closing) && !isEscaped(text, closing)) {
      if (delimiter.close !== "$" || isInlineDollarClose(text, closing)) return closing;
    }

    closing += 1;
  }

  return -1;
}

function findLatexRanges(text) {
  const ranges = [];
  const excluded = findMarkdownCodeRanges(text);

  for (let position = 0; position < text.length; position += 1) {
    if (overlapsRanges(position, position + 1, excluded)) continue;

    const delimiter = delimiterAt(text, position);
    if (!delimiter) continue;

    const closing = findClosingDelimiter(text, delimiter);
    if (closing === -1) continue;

    const to = closing + delimiter.close.length;
    const formula = text.slice(delimiter.formulaFrom, closing).trim();

    if (formula && !overlapsRanges(position, to, excluded)) {
      ranges.push({ from: position, to, formula, displayMode: delimiter.displayMode });
    }

    position = to - 1;
  }

  return ranges;
}

async function renderedDemoHtml(markdown) {
  const replacements = new Map();
  const ranges = findLatexRanges(markdown);
  let withLatexTokens = markdown;

  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    const token = `MATHHILLSLATEX${markdown.length}TOKEN${index}`;
    replacements.set(
      token,
      katex.renderToString(range.formula, { displayMode: range.displayMode, throwOnError: false })
    );
    withLatexTokens = `${withLatexTokens.slice(0, range.from)}${token}${withLatexTokens.slice(range.to)}`;
  }

  let html = await marked.parse(withLatexTokens, { breaks: true, gfm: true });
  for (const [token, latexHtml] of replacements) {
    html = html.replaceAll(token, latexHtml);
  }
  return html;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("hex");
  return `pbkdf2:210000:${salt}:${hash}`;
}

async function syncLinks(sourceType, sourceId, markdown) {
  await prisma.internalLink.deleteMany({ where: { sourceType, sourceId } });

  for (const link of extractWikiLinks(markdown)) {
    const concept = await prisma.concept.findUnique({
      where: { slug: link.targetSlug },
      select: { id: true }
    });

    await prisma.internalLink.create({
      data: {
        sourceType,
        sourceId,
        targetSlug: link.targetSlug,
        targetType: concept ? TargetType.CONCEPT : TargetType.UNKNOWN,
        exists: Boolean(concept),
        label: link.label
      }
    });
  }
}

async function main() {
  await removeOldFrenchDemoData();

  const curator = await prisma.user.upsert({
    where: { username: "curator" },
    update: {
      displayName: "Curator",
      email: "curator@example.com",
      passwordHash: hashPassword("curator-demo"),
      role: "MODERATOR"
    },
    create: {
      username: "curator",
      displayName: "Curator",
      email: "curator@example.com",
      passwordHash: hashPassword("curator-demo"),
      bio: "Prototype demo account.",
      role: "MODERATOR"
    }
  });

  const polynomial = await prisma.concept.upsert({
    where: { slug: "polynomial" },
    update: {
      title: "Polynomial",
      domain: "ALGEBRA",
      status: "USABLE",
      bodyMarkdown:
        "## Definition\n\nA polynomial is an expression built from an indeterminate and coefficients.\n\n## See also\n\n[[Vieta relations]]",
      bodyHtml: simpleHtml(
        "## Definition\n\nA polynomial is an expression built from an indeterminate and coefficients.\n\n## See also\n\n[[Vieta relations]]"
      )
    },
    create: {
      slug: "polynomial",
      title: "Polynomial",
      domain: "ALGEBRA",
      status: "USABLE",
      bodyMarkdown:
        "## Definition\n\nA polynomial is an expression built from an indeterminate and coefficients.\n\n## See also\n\n[[Vieta relations]]",
      bodyHtml: simpleHtml(
        "## Definition\n\nA polynomial is an expression built from an indeterminate and coefficients.\n\n## See also\n\n[[Vieta relations]]"
      ),
      createdById: curator.id,
      lastEditedById: curator.id
    }
  });

  const viete = await prisma.concept.upsert({
    where: { slug: "vieta-relations" },
    update: {
      title: "Vieta Relations",
      domain: "ALGEBRA",
      status: "REVIEWED",
      bodyMarkdown:
        "## Idea\n\nVieta relations connect the coefficients of a [[polynomial]] to sums and products of its roots.",
      bodyHtml: simpleHtml(
        "## Idea\n\nVieta relations connect the coefficients of a [[polynomial]] to sums and products of its roots."
      )
    },
    create: {
      slug: "vieta-relations",
      title: "Vieta Relations",
      domain: "ALGEBRA",
      status: "REVIEWED",
      bodyMarkdown:
        "## Idea\n\nVieta relations connect the coefficients of a [[polynomial]] to sums and products of its roots.",
      bodyHtml: simpleHtml(
        "## Idea\n\nVieta relations connect the coefficients of a [[polynomial]] to sums and products of its roots."
      ),
      createdById: curator.id,
      lastEditedById: curator.id
    }
  });

  await syncLinks(SourceType.CONCEPT, polynomial.id, polynomial.bodyMarkdown);
  await syncLinks(SourceType.CONCEPT, viete.id, viete.bodyMarkdown);

  await prisma.conceptAlias.upsert({
    where: { aliasSlug: "vietas-formulas" },
    update: { alias: "Vieta's formulas", conceptId: viete.id },
    create: { alias: "Vieta's formulas", aliasSlug: "vietas-formulas", conceptId: viete.id }
  });
  await prisma.conceptAlias.upsert({
    where: { aliasSlug: "vietes-relations" },
    update: { alias: "Viète relations", conceptId: viete.id },
    create: { alias: "Viète relations", aliasSlug: "vietes-relations", conceptId: viete.id }
  });

  await prisma.conceptReference.deleteMany({ where: { conceptId: viete.id } });
  await prisma.conceptReference.createMany({
    data: [
      {
        conceptId: viete.id,
        title: "Encyclopedia of Mathematics: Vieta theorem",
        url: "https://encyclopediaofmath.org/wiki/Vieta_theorem",
        note: "Reference overview",
        position: 1
      },
      {
        conceptId: viete.id,
        title: "Any standard algebra textbook",
        note: "See the chapter on roots and coefficients",
        position: 2
      }
    ]
  });

  for (const concept of [polynomial, viete]) {
    const revision = await prisma.pageRevision.findFirst({
      where: { pageType: "CONCEPT", pageId: concept.id }
    });
    if (!revision) {
      await prisma.pageRevision.create({
        data: {
          pageType: "CONCEPT",
          pageId: concept.id,
          markdown: concept.bodyMarkdown,
          editedById: curator.id,
          editSummary: "Initial encyclopedia article"
        }
      });
    }
  }

  await prisma.conceptWatch.upsert({
    where: { userId_conceptId: { userId: curator.id, conceptId: viete.id } },
    update: {},
    create: { userId: curator.id, conceptId: viete.id }
  });

  const talkPost = await prisma.conceptTalkPost.findFirst({
    where: { conceptId: viete.id, authorId: curator.id }
  });
  if (!talkPost) {
    await prisma.conceptTalkPost.create({
      data: {
        conceptId: viete.id,
        authorId: curator.id,
        bodyMarkdown: "The article should eventually include a short derivation and clarify sign conventions.",
        bodyHtml: simpleHtml("The article should eventually include a short derivation and clarify sign conventions.")
      }
    });
  }

  const bodyMarkdown =
    "Let $P \\in \\mathbb{C}[X]$ be a [[polynomial]] of degree $n$, with nonzero roots.\n\nExpress the sum of the inverses of the roots in terms of the coefficients of $P$.\n\nSee also: [[Vieta relations]], [[multiple root]].";

  const problem = await prisma.problem.upsert({
    where: { slug: "roots-and-coefficients" },
    update: {
      title: "Roots and coefficients",
      bodyMarkdown,
      bodyHtml: simpleHtml(bodyMarkdown),
      difficulty: 55,
      domain: "ALGEBRA",
      origin: "Classical algebra exercise",
      originChapter: "Roots and coefficients",
      originPage: "Demo problem 1",
      originNote: "Problems of this form appear in many algebra textbooks. This wording is an independent demo version.",
      license: "CC BY-SA 4.0"
    },
    create: {
      slug: "roots-and-coefficients",
      title: "Roots and coefficients",
      bodyMarkdown,
      bodyHtml: simpleHtml(bodyMarkdown),
      difficulty: 55,
      domain: "ALGEBRA",
      origin: "Classical algebra exercise",
      originChapter: "Roots and coefficients",
      originPage: "Demo problem 1",
      originNote: "Problems of this form appear in many algebra textbooks. This wording is an independent demo version.",
      license: "CC BY-SA 4.0",
      authorId: curator.id,
      thread: { create: {} }
    }
  });

  await syncLinks(SourceType.PROBLEM, problem.id, bodyMarkdown);
  await syncProblemTags(problem.id, ["polynomials", "roots", "algebra"]);
  await prisma.tag.upsert({
    where: { slug: "conjecture" },
    update: { name: "conjecture" },
    create: { slug: "conjecture", name: "conjecture", description: "An open problem with no known solution supplied." }
  });
  await prisma.tag.upsert({
    where: { slug: "trick-question" },
    update: { name: "Trick question" },
    create: {
      slug: "trick-question",
      name: "Trick question",
      description: "A spoiler tag for problems whose main difficulty is noticing a trap in the wording."
    }
  });

  const simpleProblems = [
    {
      slug: "can-two-consecutive-integers-have-odd-product",
      title: "Can two consecutive integers have odd product?",
      bodyMarkdown: "Let $n$ be an integer.\n\nCan $n(n+1)$ be odd? Explain.",
      difficulty: 5,
      domain: "ARITHMETIC",
      tags: ["parity", "integers"]
    },
    {
      slug: "a-nonnegative-function-with-zero-integral",
      title: "A nonnegative function with zero integral",
      bodyMarkdown:
        "Let $f:[0,1]\\to\\mathbb{R}$ be continuous, with $f(x)\\geq 0$ for every $x\\in[0,1]$.\n\nSuppose that $\\int_0^1 f(x)\\,dx=0$.\n\nWhat can $f$ be?",
      difficulty: 18,
      domain: "ANALYSIS",
      tags: ["continuity", "integrals"]
    },
    {
      slug: "solutions-of-x-squared-equals-x",
      title: "A simple quadratic equation",
      bodyMarkdown: "Find all real numbers $x$ such that $x^2=x$.",
      difficulty: 4,
      domain: "ALGEBRA",
      tags: ["equations", "factorization"]
    },
    {
      slug: "subsets-of-a-three-element-set",
      title: "Subsets of a three-element set",
      bodyMarkdown: "Let $E=\\{1,2,3\\}$.\n\nList all subsets of $E$. How many are there?",
      difficulty: 3,
      domain: "COMBINATORICS",
      tags: ["sets", "counting"]
    },
    {
      slug: "a-sequence-that-stops-moving",
      title: "A sequence that stops moving",
      bodyMarkdown: "A real sequence $(u_n)_{n\\geq 0}$ satisfies $u_{n+1}=u_n$ for every $n\\geq 0$.\n\nWhat are the possible forms of $(u_n)$?",
      difficulty: 6,
      domain: "ANALYSIS",
      tags: ["sequences"]
    },
    {
      slug: "two-vectors-spanning-the-plane",
      title: "Two vectors spanning the plane",
      bodyMarkdown: "Do the vectors $(1,0)$ and $(1,1)$ span $\\mathbb{R}^2$? Explain.",
      difficulty: 8,
      domain: "ALGEBRA",
      tags: ["linear algebra", "vectors", "span"]
    },
    {
      slug: "a-dependent-family-in-space",
      title: "A dependent family in space",
      bodyMarkdown:
        "In $\\mathbb{R}^3$, consider the vectors $u=(1,0,0)$, $v=(0,1,0)$, and $w=(1,1,0)$.\n\nAre $u,v,w$ linearly independent?",
      difficulty: 10,
      domain: "ALGEBRA",
      tags: ["linear algebra", "vectors", "linear independence"]
    },
    {
      slug: "a-set-that-almost-looks-like-a-subspace",
      title: "A set that almost looks like a subspace",
      bodyMarkdown:
        "Let $E=\\{(x,y)\\in\\mathbb{R}^2\\mid x+y=1\\}$.\n\nIs $E$ a vector subspace of $\\mathbb{R}^2$?",
      difficulty: 12,
      domain: "ALGEBRA",
      tags: ["linear algebra", "subspaces"]
    },
    {
      slug: "a-matrix-with-no-effect",
      title: "A matrix with no effect",
      bodyMarkdown:
        "Let $A$ be a real $2\\times 2$ matrix such that $Av=v$ for every vector $v\\in\\mathbb{R}^2$.\n\nWhat is $A$?",
      difficulty: 14,
      domain: "ALGEBRA",
      tags: ["linear algebra", "matrices"]
    },
    {
      slug: "a-linearly-defined-map",
      title: "A linearly defined map",
      bodyMarkdown:
        "A linear map $T:\\mathbb{R}^2\\to\\mathbb{R}^2$ satisfies $T(1,0)=(2,1)$ and $T(0,1)=(-1,3)$.\n\nWhat is $T(x,y)$?",
      difficulty: 16,
      domain: "ALGEBRA",
      tags: ["linear algebra", "linear maps"]
    }
  ];

  for (const simpleProblem of simpleProblems) {
    await upsertDemoProblem(curator.id, simpleProblem);
  }
  await prisma.tag.deleteMany({ where: { slug: { in: DIFFICULTY_TAG_SLUGS } } });

  const proofMarkdown =
    "Write $P(X)=a_n\\prod_{i=1}^n(X-r_i)$. Vieta's relations give $\\sum_i r_i^{-1}=-a_1/a_0$.";
  const proof = await prisma.problemProof.findFirst({
    where: { problemId: problem.id, authorId: curator.id }
  });
  if (proof) {
    await prisma.problemProof.update({
      where: { id: proof.id },
      data: { bodyMarkdown: proofMarkdown, bodyHtml: await renderedDemoHtml(proofMarkdown) }
    });
  } else {
    await prisma.problemProof.create({
      data: {
        problemId: problem.id,
        authorId: curator.id,
        bodyMarkdown: proofMarkdown,
        bodyHtml: await renderedDemoHtml(proofMarkdown)
      }
    });
  }
  const now = new Date();
  await prisma.problemAttempt.upsert({
    where: {
      userId_problemId: {
        userId: curator.id,
        problemId: problem.id
      }
    },
    update: {
      discussionUnlockAt: new Date(now.getTime() - 60 * 60 * 1000),
      status: "SOLVED"
    },
    create: {
      userId: curator.id,
      problemId: problem.id,
      startedAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
      discussionUnlockAt: new Date(now.getTime() - 60 * 60 * 1000),
      status: "SOLVED"
    }
  });

  const thread = await prisma.discussionThread.findUnique({
    where: { problemId: problem.id }
  });
  if (thread) {
    const demoPost = await prisma.discussionPost.findFirst({
      where: {
        threadId: thread.id,
        authorId: curator.id,
        bodyMarkdown: { contains: "Use the constant coefficient" }
      }
    });

    if (!demoPost) {
      await prisma.discussionPost.create({
        data: {
          threadId: thread.id,
          authorId: curator.id,
          type: "HINT",
          bodyMarkdown:
            "Use the constant coefficient and the coefficient of $X$ in the factorized form of $P$.",
          bodyHtml: simpleHtml(
            "Use the constant coefficient and the coefficient of $X$ in the factorized form of $P$."
          )
        }
      });
    }
  }

  const playlist = await prisma.playlist.upsert({
    where: { slug: "polynomials-first-path" },
    update: {
      title: "Polynomials: First Path",
      descriptionMarkdown:
        "A short first path for testing [[polynomial|polynomials]], roots, and coefficients.",
      descriptionHtml: simpleHtml(
        "A short first path for testing [[polynomial|polynomials]], roots, and coefficients."
      )
    },
    create: {
      slug: "polynomials-first-path",
      title: "Polynomials: First Path",
      descriptionMarkdown:
        "A short first path for testing [[polynomial|polynomials]], roots, and coefficients.",
      descriptionHtml: simpleHtml(
        "A short first path for testing [[polynomial|polynomials]], roots, and coefficients."
      ),
      authorId: curator.id
    }
  });

  await prisma.playlistItem.upsert({
    where: {
      playlistId_problemId: {
        playlistId: playlist.id,
        problemId: problem.id
      }
    },
    update: {},
    create: {
      playlistId: playlist.id,
      problemId: problem.id,
      position: 1,
      noteMarkdown: "Start by identifying the constant coefficient."
    }
  });

  await prisma.playlistNode.deleteMany({ where: { playlistId: playlist.id } });
  const introNode = await prisma.playlistNode.create({
    data: {
      playlistId: playlist.id,
      kind: PlaylistNodeKind.CONCEPT,
      conceptId: polynomial.id,
      title: "Start with the object",
      bodyMarkdown: "Read the definition. If it feels clear, move to the first exercise.",
      bodyHtml: await renderedDemoHtml("Read the definition. If it feels clear, move to the first exercise."),
      position: 1,
      isStart: true
    }
  });
  const problemNode = await prisma.playlistNode.create({
    data: {
      playlistId: playlist.id,
      kind: PlaylistNodeKind.PROBLEM,
      problemId: problem.id,
      title: "Try roots and coefficients",
      bodyMarkdown: "Use this as the first serious check that the coefficient language is usable.",
      bodyHtml: await renderedDemoHtml("Use this as the first serious check that the coefficient language is usable."),
      position: 2
    }
  });
  const reviewNode = await prisma.playlistNode.create({
    data: {
      playlistId: playlist.id,
      kind: PlaylistNodeKind.CONCEPT,
      conceptId: viete.id,
      title: "Review Vieta relations",
      bodyMarkdown: "If the exercise felt opaque, revisit the relationship between roots and coefficients.",
      bodyHtml: await renderedDemoHtml(
        "If the exercise felt opaque, revisit the relationship between roots and coefficients."
      ),
      position: 3
    }
  });
  await prisma.playlistChoice.createMany({
    data: [
      {
        fromNodeId: introNode.id,
        toNodeId: problemNode.id,
        label: "I understand",
        note: "Go to the first exercise.",
        position: 1
      },
      {
        fromNodeId: introNode.id,
        toNodeId: reviewNode.id,
        label: "I need more context",
        note: "Read a related concept first.",
        position: 2
      },
      {
        fromNodeId: reviewNode.id,
        toNodeId: problemNode.id,
        label: "Ready to try",
        position: 1
      }
    ]
  });

  await prisma.problemFavorite.upsert({
    where: {
      userId_problemId: {
        userId: curator.id,
        problemId: problem.id
      }
    },
    update: {},
    create: {
      userId: curator.id,
      problemId: problem.id
    }
  });

  await prisma.playlistFollow.upsert({
    where: {
      userId_playlistId: {
        userId: curator.id,
        playlistId: playlist.id
      }
    },
    update: {},
    create: {
      userId: curator.id,
      playlistId: playlist.id
    }
  });

  const existingSuggestion = await prisma.suggestion.findFirst({
    where: { title: "Keyboard shortcuts for problem pages", authorId: curator.id }
  });
  if (!existingSuggestion) {
    await prisma.suggestion.create({
      data: {
        authorId: curator.id,
        title: "Keyboard shortcuts for problem pages",
        body: "A small shortcut to toggle zen mode would be useful later."
      }
    });
  }

  console.log("Demo data ready: curator, concepts, problem, playlist, and product samples.");
}

async function upsertDemoProblem(authorId, item) {
  const bodyHtml = await renderedDemoHtml(item.bodyMarkdown);
  const problem = await prisma.problem.upsert({
    where: { slug: item.slug },
    update: {
      title: item.title,
      bodyMarkdown: item.bodyMarkdown,
      bodyHtml,
      difficulty: item.difficulty,
      domain: item.domain,
      origin: "Unknown",
      originChapter: null,
      originPage: null,
      originNote: null,
      license: "CC BY-SA 4.0",
      listed: true,
      qualityStatus: "UNREVIEWED"
    },
    create: {
      slug: item.slug,
      title: item.title,
      bodyMarkdown: item.bodyMarkdown,
      bodyHtml,
      difficulty: item.difficulty,
      domain: item.domain,
      origin: "Unknown",
      originChapter: null,
      originPage: null,
      originNote: null,
      license: "CC BY-SA 4.0",
      listed: true,
      qualityStatus: "UNREVIEWED",
      authorId,
      thread: { create: {} }
    }
  });

  await syncLinks(SourceType.PROBLEM, problem.id, item.bodyMarkdown);
  await syncProblemTags(problem.id, item.tags);

  const revision = await prisma.pageRevision.findFirst({
    where: { pageType: SourceType.PROBLEM, pageId: problem.id }
  });
  if (!revision) {
    await prisma.pageRevision.create({
      data: {
        pageType: SourceType.PROBLEM,
        pageId: problem.id,
        markdown: item.bodyMarkdown,
        editedById: authorId,
        editSummary: "Problem created"
      }
    });
  }
}

async function syncProblemTags(problemId, tagNames) {
  await prisma.problemTag.deleteMany({ where: { problemId } });

  for (const name of tagNames) {
    const slug = slugify(name);
    if (DIFFICULTY_TAG_SLUGS.includes(slug)) continue;

    const tag = await prisma.tag.upsert({
      where: { slug },
      update: { name },
      create: { slug, name }
    });

    await prisma.problemTag.create({
      data: { problemId, tagId: tag.id }
    });
  }
}

async function removeOldFrenchDemoData() {
  const oldConceptSlugs = ["polynome", "relations-de-viete"];
  const oldProblemSlugs = ["racines-et-coefficients"];
  const oldPlaylistSlugs = ["polynomes-premier-parcours"];

  const [oldConcepts, oldProblems, oldPlaylists] = await Promise.all([
    prisma.concept.findMany({ where: { slug: { in: oldConceptSlugs } }, select: { id: true } }),
    prisma.problem.findMany({ where: { slug: { in: oldProblemSlugs } }, select: { id: true } }),
    prisma.playlist.findMany({ where: { slug: { in: oldPlaylistSlugs } }, select: { id: true } })
  ]);

  await prisma.internalLink.deleteMany({
    where: {
      OR: [
        { targetSlug: { in: [...oldConceptSlugs, "racine-multiple"] } },
        { sourceType: SourceType.CONCEPT, sourceId: { in: oldConcepts.map((item) => item.id) } },
        { sourceType: SourceType.PROBLEM, sourceId: { in: oldProblems.map((item) => item.id) } },
        { sourceType: SourceType.PLAYLIST, sourceId: { in: oldPlaylists.map((item) => item.id) } }
      ]
    }
  });

  await prisma.playlist.deleteMany({ where: { slug: { in: oldPlaylistSlugs } } });
  await prisma.problem.deleteMany({ where: { slug: { in: oldProblemSlugs } } });
  await prisma.concept.deleteMany({ where: { slug: { in: oldConceptSlugs } } });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
