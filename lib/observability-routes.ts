const DYNAMIC_ROUTE_PATTERNS: Array<[RegExp, string]> = [
  [/^\/problems\/[^/]+\/proofs\/[^/]+\/discussion\/?$/, "/problems/[slug]/proofs/[proofId]/discussion"],
  [/^\/problems\/[^/]+\/proofs\/[^/]+\/edit\/?$/, "/problems/[slug]/proofs/[proofId]/edit"],
  [/^\/problems\/[^/]+\/verification\/[^/]+\/?$/, "/problems/[slug]/verification/[requestId]"],
  [/^\/problems\/[^/]+\/(discussion|edit|export|history|translate)\/?$/, "/problems/[slug]/$1"],
  [/^\/problems\/[^/]+\/?$/, "/problems/[slug]"],
  [/^\/concepts\/[^/]+\/(edit|export|history|merge|talk|translate)\/?$/, "/concepts/[slug]/$1"],
  [/^\/concepts\/[^/]+\/?$/, "/concepts/[slug]"],
  [/^\/explorations\/[^/]+\/(edit|export|history|start)\/?$/, "/explorations/[slug]/$1"],
  [/^\/explorations\/[^/]+\/?$/, "/explorations/[slug]"],
  [/^\/playlists\/[^/]+\/(edit|export|start)\/?$/, "/playlists/[slug]/$1"],
  [/^\/playlists\/[^/]+\/?$/, "/playlists/[slug]"],
  [/^\/profile\/[^/]+\/edit\/?$/, "/profile/[username]/edit"],
  [/^\/profile\/[^/]+\/?$/, "/profile/[username]"],
  [/^\/chat\/[^/]+\/?$/, "/chat/[username]"],
  [/^\/challenge\/[^/]+\/?$/, "/challenge/[token]"],
  [/^\/quotes\/[^/]+\/?$/, "/quotes/[slug]"],
  [/^\/mathematicians\/[^/]+\/edit\/?$/, "/mathematicians/[slug]/edit"],
  [/^\/mathematicians\/[^/]+\/?$/, "/mathematicians/[slug]"],
  [/^\/tips\/[^/]+\/(edit|preview)\/?$/, "/tips/[id]/$1"],
  [/^\/moderation\/concept-merges\/[^/]+\/?$/, "/moderation/concept-merges/[proposalId]"],
  [/^\/moderation\/problem-edits\/[^/]+\/?$/, "/moderation/problem-edits/[proposalId]"],
  [/^\/contributing\/tasks\/site-improvements\/[^/]+\/?$/, "/contributing/tasks/site-improvements/[id]"]
];

const STATIC_ROUTES = new Set([
  "/",
  "/about",
  "/about/faq/edit",
  "/about/tutorial",
  "/concepts",
  "/concepts/new",
  "/contest",
  "/contest/edit",
  "/contest/preview",
  "/contributing",
  "/contributing/edit",
  "/contributing/tasks",
  "/contributing/tasks/site-improvements",
  "/explorations",
  "/explorations/new",
  "/friends",
  "/import",
  "/jsxgraph-studio",
  "/legal",
  "/login",
  "/login/complete",
  "/mathematicians",
  "/mathematicians/new",
  "/me",
  "/moderation",
  "/moderation/concept-merges",
  "/moderation/performance",
  "/moderation/problem-edits",
  "/notifications",
  "/playlists",
  "/playlists/new",
  "/problems",
  "/problems/new",
  "/quotes",
  "/recent-changes",
  "/roles",
  "/roles/edit",
  "/search",
  "/settings",
  "/suggestions",
  "/tips",
  "/tips/new",
  "/tips/problem-of-the-day",
  "/tips/problem-of-the-day/preview",
  "/tips/tip-of-the-day",
  "/tips/tip-of-the-day/preview",
  "/users",
  "/verify-email"
]);

export function normalizedObservabilityRoute(pathname: string) {
  const rawPath = pathname.split(/[?#]/, 1)[0]?.trim() || "/";
  if (!rawPath.startsWith("/") || rawPath.length > 120) return "/other";

  const path = rawPath.replace(/\/$/, "") || "/";
  if (STATIC_ROUTES.has(path)) return path;

  for (const [pattern, replacement] of DYNAMIC_ROUTE_PATTERNS) {
    if (pattern.test(path)) return path.replace(pattern, replacement);
  }

  return "/other";
}
