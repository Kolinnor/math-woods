import { createPlaylistAction } from "@/lib/actions/playlist-actions";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LanguageField } from "@/components/LanguageField";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { requireVerifiedUser } from "@/lib/auth";
import { requireDraftSession } from "@/lib/draft-session";
import { getPreferredContentLanguage } from "@/lib/server-language";

export default async function NewPlaylistPage({
  searchParams
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  await requireVerifiedUser();
  const draftSession = requireDraftSession("/playlists/new", await searchParams);
  const preferredLanguage = await getPreferredContentLanguage();

  return (
    <ForestPageLayout
      title="New playlist"
      eyebrow="Learning path"
      heroImage="/art/rye.jpg"
      heroAlt="Ivan Shishkin, Rye"
      description="A sequence of problems with a guiding thread."
      workspaceClassName="forest-page-workspace-narrow"
    >
      <form action={createPlaylistAction} className="panel grid gap-4 p-5">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Title</span>
          <input name="title" required placeholder="Polynomial roots: a progressive path" />
        </label>
        <LanguageField defaultValue={preferredLanguage} />
        <div className="grid gap-2">
          <span className="text-sm font-medium">Description</span>
          <MarkdownEditor
            name="descriptionMarkdown"
            initialValue={"Goal, prerequisites, recommended order.\n\nSee also [[polynomial]]."}
            draftKey={`playlist:new:${draftSession}:description`}
          />
        </div>
        <button type="submit">Create</button>
      </form>
    </ForestPageLayout>
  );
}
