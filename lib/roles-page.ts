import { prisma } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown";

export const DEFAULT_ROLES_PAGE_CONTENT = {
  id: 1,
  bodyMarkdown: ""
} as const;

export async function loadRolesPage() {
  return prisma.rolesPageContent.findUnique({ where: { id: 1 } })
    .then((content) => content ?? DEFAULT_ROLES_PAGE_CONTENT);
}

export async function loadRenderedRolesPage() {
  const content = await loadRolesPage();
  return {
    ...content,
    bodyHtml: await renderMarkdown(content.bodyMarkdown)
  };
}
