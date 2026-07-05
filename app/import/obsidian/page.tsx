import { ForestPageLayout } from "@/components/ForestPageLayout";
import { requireOwner } from "@/lib/auth";
import { ObsidianVaultAuditor } from "./ObsidianVaultAuditor";

export const dynamic = "force-dynamic";

export default async function ObsidianImportPage() {
  await requireOwner();

  return (
    <ForestPageLayout
      title="Obsidian migration"
      eyebrow="Owner tools"
      heroImage="/art/pine-forest.jpg"
      heroAlt="Ivan Shishkin, Pine Forest"
      description="Audit a personal Obsidian vault locally before deciding what can become public Math Woods content."
      workspaceClassName="forest-page-workspace-narrow"
    >
      <ObsidianVaultAuditor />
    </ForestPageLayout>
  );
}
