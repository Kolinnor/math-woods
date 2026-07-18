import { createExplorationAction } from "@/lib/actions/exploration-actions";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LanguageField } from "@/components/LanguageField";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { requireVerifiedUser } from "@/lib/auth";
import { requireDraftSession } from "@/lib/draft-session";
import { getPreferredContentLanguage } from "@/lib/server-language";

export default async function NewExplorationPage({
  searchParams
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  await requireVerifiedUser();
  const draftSession = requireDraftSession("/explorations/new", await searchParams);
  const preferredLanguage = await getPreferredContentLanguage();

  return (
    <ForestPageLayout
      title="New exploration"
      eyebrow="Learning path"
      heroImage="/art/playlists-forest-lodge.webp"
      heroAlt="Ivan Shishkin, Forest Lodge"
      description="Write a multipage mathematical story, then make it interactive."
      workspaceClassName="forest-page-workspace-narrow"
    >
      <form action={createExplorationAction} className="panel grid gap-4 p-5">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Title</span>
          <input name="title" required placeholder="Polynomial roots: a progressive path" />
        </label>
        <LanguageField defaultValue={preferredLanguage} />
        <label className="grid gap-2">
          <span className="text-sm font-medium">Short summary</span>
          <input name="summary" placeholder="What readers will understand or discover" />
        </label>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Introduction</span>
          <MarkdownEditor
            name="descriptionMarkdown"
            initialValue={"Set the scene, state the central question, and invite the reader in.\n\nSee also [[polynomial]]."}
            draftKey={`exploration:new:${draftSession}:description`}
            localDrafts={false}
          />
        </div>
        <button type="submit">Open the Studio</button>
      </form>
    </ForestPageLayout>
  );
}
