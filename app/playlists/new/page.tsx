import { createPlaylistAction } from "@/lib/actions/playlist-actions";
import { LanguageField } from "@/components/LanguageField";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { requireVerifiedUser } from "@/lib/auth";
import { getPreferredContentLanguage } from "@/lib/server-language";

export default async function NewPlaylistPage() {
  await requireVerifiedUser();
  const preferredLanguage = await getPreferredContentLanguage();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold">New playlist</h1>
      <p className="muted mb-5">A sequence of problems with a guiding thread.</p>

      <form action={createPlaylistAction} className="panel grid gap-4 p-5">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Title</span>
          <input name="title" required placeholder="Polynomial roots: a progressive path" />
        </label>
        <LanguageField defaultValue={preferredLanguage} />
        <label className="grid gap-2">
          <span className="text-sm font-medium">Description</span>
          <MarkdownEditor
            name="descriptionMarkdown"
            initialValue={"Goal, prerequisites, recommended order.\n\nSee also [[polynomial]]."}
          />
        </label>
        <button type="submit">Create</button>
      </form>
    </div>
  );
}
