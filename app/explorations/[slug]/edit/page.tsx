import Link from "next/link";
import {
  ArrowLeft,
  FileClock,
  Map,
  Pencil,
  Plus,
  Send,
  Trash2,
  X
} from "lucide-react";
import {
  ExplorationBlockKind,
  ExplorationOptionAction,
  ExplorationQuizType,
  ExplorationStatus,
  MathDomain,
  PlaylistVisibility
} from "@prisma/client";
import { notFound } from "next/navigation";
import { AutoSaveForm } from "@/components/AutoSaveForm";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { DeletePlaylistButton } from "@/components/DeletePlaylistButton";
import { ExplorationAddContentForm } from "@/components/ExplorationAddContentForm";
import { ExplorationBlockList } from "@/components/ExplorationBlockList";
import { ExplorationBlockNameHelp } from "@/components/ExplorationBlockNameHelp";
import { ExplorationChoiceActionFields } from "@/components/ExplorationChoiceActionFields";
import { ExplorationMapCanvas, type ExplorationMapBlock } from "@/components/ExplorationMapCanvas";
import { ExplorationNextBlockFields } from "@/components/ExplorationNextBlockFields";
import { ExplorationSettingsButton } from "@/components/ExplorationSettingsButton";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { AutoSaveMarkdownEditor } from "@/components/markdown/AutoSaveMarkdownEditor";
import {
  addExplorationCollaboratorAction,
  changeExplorationStatusAction,
  cloneExplorationTranslationAction,
  createExplorationOptionAction,
  deleteExplorationBlockAction,
  deleteExplorationOptionAction,
  publishExplorationAction,
  removeExplorationCollaboratorAction,
  updateExplorationBlockAction,
  updateExplorationBlockContinueFormAction,
  updateExplorationBlockNameAction,
  updateExplorationMetadataAction,
  updateExplorationOptionAction
} from "@/lib/actions/exploration-actions";
import { deletePlaylistAction } from "@/lib/actions/playlist-actions";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canEditExploration, explorationBlockLabel } from "@/lib/explorations";
import { SUPPORTED_CONTENT_LANGUAGES } from "@/lib/languages";
import { canDeletePlaylist } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const ADD_BLOCK_KINDS: ExplorationBlockKind[] = [
  ExplorationBlockKind.MARKDOWN,
  ExplorationBlockKind.PROBLEM,
  ExplorationBlockKind.CONCEPT,
  ExplorationBlockKind.CHOICE
];
const EDITOR_BLOCK_KINDS: ExplorationBlockKind[] = [...ADD_BLOCK_KINDS, ExplorationBlockKind.QUIZ];

function editorBlockLabel(kind: ExplorationBlockKind) {
  return kind === ExplorationBlockKind.MARKDOWN ? "Text" : explorationBlockLabel(kind);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function blockFallbackLabel(block: {
  kind: ExplorationBlockKind;
  bodyMarkdown: string | null;
  problem: { title: string } | null;
  concept: { title: string } | null;
}) {
  if (block.problem) return block.problem.title;
  if (block.concept) return block.concept.title;
  const firstLine = block.bodyMarkdown?.split("\n").find((line) => line.trim())?.trim();
  return firstLine?.slice(0, 64) || editorBlockLabel(block.kind);
}

function blockDisplayLabel(block: Parameters<typeof blockFallbackLabel>[0] & { name: string | null }) {
  return block.name || blockFallbackLabel(block);
}

export default async function EditExplorationPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ block?: string; view?: string }>;
}) {
  const user = await requireVerifiedUser();
  const { slug } = await params;
  const { block: selectedBlockRaw, view } = await searchParams;
  const exploration = await prisma.playlist.findUnique({
    where: { slug },
    include: {
      author: true,
      collaborators: { include: { user: true }, orderBy: { createdAt: "asc" } },
      pages: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: {
          blocks: {
            orderBy: [{ position: "asc" }, { id: "asc" }],
            include: {
              problem: { select: { slug: true, title: true } },
              concept: { select: { slug: true, title: true } },
              options: { orderBy: { position: "asc" } },
              outcomes: { include: { matches: true }, orderBy: { position: "asc" } }
            }
          }
        }
      }
    }
  });
  if (!exploration || !canEditExploration(user, exploration)) notFound();

  const blocks = exploration.pages
    .flatMap((page) => page.blocks)
    .sort((left, right) => left.position - right.position || left.id - right.id);
  const selectedBlockId = Number(selectedBlockRaw);
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) ?? blocks[0] ?? null;
  const mapMode = view !== "block" || !selectedBlockRaw;
  const canDelete = canDeletePlaylist(user, exploration);
  const settingsDialogId = "exploration-settings-dialog";
  const blockLabels = blocks.map((block, index) => ({
    id: block.id,
    label: `${index + 1}. ${blockDisplayLabel(block)}`
  }));
  const mapBlocks: ExplorationMapBlock[] = blocks.map((block) => ({
    id: block.id,
    key: block.key,
    kind: editorBlockLabel(block.kind),
    name: block.name,
    fallbackLabel: blockFallbackLabel(block),
    label: blockDisplayLabel(block),
    excerpt: (block.bodyMarkdown ?? "").replaceAll("\n", " ").slice(0, 110),
    canvasX: block.canvasX,
    canvasY: block.canvasY,
    isStart: block.isStart,
    isEnd: block.isEnd,
    continueToBlockId: block.continueToBlockId,
    autoContinue: block.autoContinue,
    options: block.options.map((option) => ({ id: option.id, label: option.label, toBlockId: option.toBlockId })),
    outcomes: block.outcomes.map((outcome) => ({ id: outcome.id, label: outcome.label, toBlockId: outcome.toBlockId }))
  }));

  return (
    <ForestPageLayout
      title={exploration.title}
      heroImage={exploration.coverImageUrl || "/art/playlists-forest-lodge.webp"}
      heroAlt={exploration.coverImageUrl ? `Cover for ${exploration.title}` : "Ivan Shishkin, Forest Lodge"}
      className="exploration-studio-page"
      workspaceClassName="forest-page-workspace-wide"
      actions={
        <>
          <Link href={`/explorations/${exploration.slug}/start` as never} className="button secondary"><ArrowLeft size={16} /> Read</Link>
          <Link href={`/explorations/${exploration.slug}/history` as never} className="button secondary"><FileClock size={16} /> History</Link>
          <ExplorationSettingsButton dialogId={settingsDialogId} />
        </>
      }
    >
      <section className="exploration-studio-toolbar">
        <nav className="exploration-studio-view-switch" aria-label="Exploration editor view">
          <Link className={mapMode ? "button is-current" : "button secondary"} href={`/explorations/${exploration.slug}/edit?view=map` as never}><Map size={16} /> Map</Link>
          {selectedBlock && <Link className={!mapMode ? "button is-current" : "button secondary"} href={`/explorations/${exploration.slug}/edit?view=block&block=${selectedBlock.id}` as never}><Pencil size={16} /> Edit blocks</Link>}
        </nav>
        <div className="exploration-studio-actions">
          {exploration.status !== ExplorationStatus.IN_REVIEW && (
            <form action={changeExplorationStatusAction.bind(null, exploration.id, ExplorationStatus.IN_REVIEW)}>
              <button type="submit" className="secondary"><Send size={16} /> Send for review</button>
            </form>
          )}
          {exploration.status !== ExplorationStatus.PUBLISHED && (
            <form action={publishExplorationAction.bind(null, exploration.id)}><button type="submit">Publish</button></form>
          )}
        </div>
      </section>

      {mapMode ? (
        <ExplorationMapCanvas
          explorationId={exploration.id}
          explorationSlug={exploration.slug}
          initialBlocks={mapBlocks}
          kinds={ADD_BLOCK_KINDS.map((kind) => ({ value: kind, label: editorBlockLabel(kind) }))}
        />
      ) : (
        <div className="exploration-studio-shell">
          <aside className="exploration-studio-sidebar">
            <div className="exploration-studio-sidebar-heading"><h2>Blocks</h2><span>{blocks.length}</span></div>
            <ExplorationBlockList
              currentBlockId={selectedBlock?.id ?? null}
              initialBlocks={blocks.map((block) => ({
                id: block.id,
                href: `/explorations/${exploration.slug}/edit?view=block&block=${block.id}`,
                label: blockDisplayLabel(block)
              }))}
            />
            <details className="studio-add-block">
              <summary><Plus size={16} /> New block</summary>
              <ExplorationAddContentForm explorationId={exploration.id} explorationSlug={exploration.slug} kinds={ADD_BLOCK_KINDS.map((kind) => ({ value: kind, label: editorBlockLabel(kind) }))} />
            </details>
          </aside>

          <main className="exploration-studio-main">
            {selectedBlock ? (() => {
              const settings = objectValue(selectedBlock.settings);
              const blockFormId = `exploration-block-${selectedBlock.id}-form`;
              return (
                <article key={selectedBlock.id} id={`block-${selectedBlock.id}`} className="studio-block-editor">
                  <div className="studio-block-topline">
                    <div className="studio-block-heading">
                      <strong>Block</strong><span aria-hidden="true">-</span>
                      <select className="studio-block-kind-select" name="kind" form={blockFormId} defaultValue={selectedBlock.kind}>
                        {EDITOR_BLOCK_KINDS.map((kind) => <option key={kind} value={kind}>{editorBlockLabel(kind)}</option>)}
                      </select>
                      <span aria-hidden="true">-</span>
                      <AutoSaveForm action={updateExplorationBlockNameAction.bind(null, selectedBlock.id)} className="studio-block-name-form" statusClassName="sr-only">
                        <input name="name" defaultValue={selectedBlock.name ?? ""} maxLength={160} placeholder="Name" aria-label="Block name" />
                      </AutoSaveForm>
                      <ExplorationBlockNameHelp />
                    </div>
                    <form action={deleteExplorationBlockAction.bind(null, selectedBlock.id)}>
                      <ConfirmSubmitButton message="Delete this block?" className="icon-button danger" title="Delete block"><Trash2 size={15} /></ConfirmSubmitButton>
                    </form>
                  </div>
                  <AutoSaveForm action={updateExplorationBlockAction.bind(null, selectedBlock.id)} className="studio-block-form" id={blockFormId} statusClassName="sr-only">
                    {(selectedBlock.kind === ExplorationBlockKind.PROBLEM || selectedBlock.kind === ExplorationBlockKind.CONCEPT) && (
                      <label><span>{selectedBlock.kind === ExplorationBlockKind.PROBLEM ? "Problem" : "Concept"}</span><input name="referenceSlug" defaultValue={selectedBlock.problem?.slug ?? selectedBlock.concept?.slug ?? ""} required /></label>
                    )}
                    {selectedBlock.kind !== ExplorationBlockKind.DIVIDER && selectedBlock.kind !== ExplorationBlockKind.HEADING && (
                      <AutoSaveMarkdownEditor name="bodyMarkdown" initialValue={selectedBlock.bodyMarkdown ?? ""} draftKey={`exploration:block:${selectedBlock.id}:body`} localDrafts={false} minHeight={selectedBlock.kind === ExplorationBlockKind.CHOICE ? "5rem" : "7rem"} lineNumbers={false} />
                    )}
                    {selectedBlock.kind === ExplorationBlockKind.QUIZ && (
                      <div className="studio-quiz-settings">
                        <div className="grid gap-4 md:grid-cols-3">
                          <label><span>Answer type</span><select name="quizType" defaultValue={selectedBlock.quizType ?? ExplorationQuizType.SINGLE_CHOICE}>{Object.values(ExplorationQuizType).map((type) => <option key={type} value={type}>{type.toLocaleLowerCase().replaceAll("_", " ")}</option>)}</select></label>
                          <label><span>Expected answer</span><input name="expectedAnswer" defaultValue={String(settings.expectedAnswer ?? "")} /></label>
                          <label><span>Tolerance</span><input name="tolerance" type="number" step="any" min={0} defaultValue={String(settings.tolerance ?? "")} /></label>
                        </div>
                        <label className="checkbox-field"><input name="caseSensitive" type="checkbox" defaultChecked={settings.caseSensitive === true} /><span><strong>Case-sensitive</strong></span></label>
                        <div className="grid gap-2"><span className="text-sm font-medium">Explanation</span><AutoSaveMarkdownEditor name="explanationMarkdown" initialValue={selectedBlock.explanationMarkdown ?? ""} draftKey={`exploration:block:${selectedBlock.id}:explanation`} localDrafts={false} minHeight="5rem" lineNumbers={false} /></div>
                      </div>
                    )}
                  </AutoSaveForm>

                  {selectedBlock.kind !== ExplorationBlockKind.CHOICE && (
                    <AutoSaveForm action={updateExplorationBlockContinueFormAction.bind(null, selectedBlock.id)} className="studio-block-route" statusClassName="sr-only">
                      <ExplorationNextBlockFields
                        blocks={blockLabels.filter((block) => block.id !== selectedBlock.id)}
                        initialAutomatic={selectedBlock.autoContinue}
                        initialBlockId={selectedBlock.continueToBlockId}
                      />
                    </AutoSaveForm>
                  )}

                  {(selectedBlock.kind === ExplorationBlockKind.QUIZ || selectedBlock.kind === ExplorationBlockKind.CHOICE) && (
                    <section className="studio-option-editor">
                      <div className="studio-option-editor-heading">{selectedBlock.kind === ExplorationBlockKind.QUIZ ? "Answers" : "Paths"}</div>
                      <div className="studio-option-editor-body">
                        {selectedBlock.options.map((option) => (
                          <div key={option.id} className="studio-option-row">
                            <AutoSaveForm action={updateExplorationOptionAction.bind(null, option.id)} className="studio-option-autosave-form" statusClassName="sr-only">
                              <label><span>Label</span><input name="label" defaultValue={option.label} required /></label>
                              {selectedBlock.kind === ExplorationBlockKind.CHOICE && <ExplorationChoiceActionFields blocks={blockLabels} currentBlockId={selectedBlock.id} toBlockId={option.toBlockId} />}
                              {selectedBlock.kind === ExplorationBlockKind.QUIZ && <label className="checkbox-field"><input name="isCorrectField" type="hidden" value="true" /><input name="isCorrect" type="checkbox" defaultChecked={option.isCorrect === true} /><span><strong>Correct</strong></span></label>}
                            </AutoSaveForm>
                            <form action={deleteExplorationOptionAction.bind(null, option.id)} className="studio-option-delete"><ConfirmSubmitButton message="Delete this option?" className="icon-button danger" title="Delete option"><Trash2 size={15} /></ConfirmSubmitButton></form>
                          </div>
                        ))}
                        <form action={createExplorationOptionAction.bind(null, selectedBlock.id)} className="studio-new-option">
                          <label><span>New option</span><input name="label" required placeholder={selectedBlock.kind === ExplorationBlockKind.QUIZ ? "An answer" : "A choice"} /></label>
                          {selectedBlock.kind === ExplorationBlockKind.CHOICE && <input name="action" type="hidden" value={ExplorationOptionAction.PAGE} />}
                          {selectedBlock.kind === ExplorationBlockKind.QUIZ && <label className="checkbox-field"><input name="isCorrect" type="checkbox" /><span><strong>Correct</strong></span></label>}
                          <button type="submit" className="secondary"><Plus size={15} /> Add</button>
                        </form>
                      </div>
                    </section>
                  )}
                </article>
              );
            })() : <p className="muted studio-empty-state">Add the first block from the map.</p>}
          </main>
        </div>
      )}

      <dialog id={settingsDialogId} className="exploration-settings-dialog">
        <div className="exploration-settings-dialog-panel">
          <header className="exploration-settings-dialog-header"><h2>Exploration settings</h2><form method="dialog"><button className="icon-button secondary" type="submit" title="Close settings"><X size={18} /></button></form></header>
          <div className="exploration-settings-dialog-body">
            <AutoSaveForm action={updateExplorationMetadataAction.bind(null, exploration.id)} className="studio-metadata-form">
              <div className="grid gap-4 md:grid-cols-2">
                <label><span>Title</span><input name="title" defaultValue={exploration.title} required /></label>
                <label><span>Short summary</span><input name="summary" defaultValue={exploration.summary ?? ""} /></label>
                <label><span>Domain</span><select name="domain" defaultValue={exploration.domain}>{Object.values(MathDomain).map((domain) => <option key={domain} value={domain}>{domain.toLocaleLowerCase()}</option>)}</select></label>
                <label><span>Audience</span><input name="audience" defaultValue={exploration.audience ?? ""} /></label>
                <label><span>Estimated minutes</span><input name="estimatedMinutes" type="number" min={1} defaultValue={exploration.estimatedMinutes ?? ""} /></label>
                <label><span>Difficulty / 100</span><input name="difficulty" type="number" min={0} max={100} defaultValue={exploration.difficulty ?? ""} /></label>
                <label><span>Visibility</span><select name="visibility" defaultValue={exploration.visibility}>{Object.values(PlaylistVisibility).map((visibility) => <option key={visibility} value={visibility}>{visibility.toLocaleLowerCase()}</option>)}</select></label>
                <label><span>License</span><input name="license" defaultValue={exploration.license} /></label>
              </div>
              <label><span>Cover image URL</span><input name="coverImageUrl" defaultValue={exploration.coverImageUrl ?? ""} /></label>
              <div className="grid gap-2"><span className="text-sm font-medium">Catalogue introduction</span><AutoSaveMarkdownEditor name="descriptionMarkdown" initialValue={exploration.descriptionMarkdown} draftKey={`exploration:${exploration.id}:metadata:description`} localDrafts={false} minHeight="8rem" /></div>
              <div className="grid gap-2"><span className="text-sm font-medium">Prerequisites</span><AutoSaveMarkdownEditor name="prerequisitesMarkdown" initialValue={exploration.prerequisitesMarkdown ?? ""} draftKey={`exploration:${exploration.id}:metadata:prerequisites`} localDrafts={false} minHeight="6rem" lineNumbers={false} /></div>
            </AutoSaveForm>
            <section className="studio-collaborators"><div className="studio-section-heading"><h2>Collaborators</h2></div><div className="studio-collaborator-list"><div><strong>{exploration.author.displayName || exploration.author.username}</strong><span>Owner</span></div>{exploration.collaborators.map((collaborator) => <div key={collaborator.userId}><strong>{collaborator.user.displayName || collaborator.user.username}</strong><span>{collaborator.role.toLocaleLowerCase()}</span><form action={removeExplorationCollaboratorAction.bind(null, exploration.id, collaborator.userId)}><button className="icon-button danger" title="Remove collaborator"><Trash2 size={15} /></button></form></div>)}</div><form action={addExplorationCollaboratorAction.bind(null, exploration.id)} className="studio-add-collaborator"><input name="username" required placeholder="Username" /><select name="role"><option value="EDITOR">Editor</option><option value="REVIEWER">Reviewer</option></select><button type="submit" className="secondary"><Plus size={16} /> Add</button></form></section>
            <section className="studio-translation-tools"><div className="studio-section-heading"><h2>Translation</h2></div><form action={cloneExplorationTranslationAction.bind(null, exploration.id)}><select name="language" defaultValue="" required><option value="" disabled>Choose language</option>{SUPPORTED_CONTENT_LANGUAGES.filter((language) => language.code !== exploration.language).map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}</select><button type="submit" className="secondary"><Plus size={16} /> Create translation</button></form></section>
            {canDelete && <section className="danger-zone"><div><h2>Archive or delete exploration</h2><p>Archiving hides the exploration while preserving its history.</p></div><div className="flex flex-wrap gap-2"><form action={changeExplorationStatusAction.bind(null, exploration.id, ExplorationStatus.ARCHIVED)}><button type="submit" className="secondary">Archive</button></form><form action={deletePlaylistAction.bind(null, exploration.id)}><DeletePlaylistButton title={exploration.title} /></form></div></section>}
          </div>
        </div>
      </dialog>
    </ForestPageLayout>
  );
}
