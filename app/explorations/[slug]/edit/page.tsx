import Link from "next/link";
import {
  ArrowLeft,
  Eye,
  FileClock,
  Map,
  Pencil,
  Plus,
  Send,
  Settings,
  Trash2,
  X
} from "lucide-react";
import {
  ExplorationBlockKind,
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
import { ExplorationBlockHeaderControls } from "@/components/ExplorationBlockHeaderControls";
import { ExplorationAddPageForm } from "@/components/ExplorationAddPageForm";
import { ExplorationPagePositionInput } from "@/components/ExplorationPagePositionInput";
import { ExplorationMapCanvas, type ExplorationMapPage } from "@/components/ExplorationMapCanvas";
import { ExplorationSettingsButton } from "@/components/ExplorationSettingsButton";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import {
  addExplorationCollaboratorAction,
  changeExplorationStatusAction,
  cloneExplorationTranslationAction,
  createExplorationOptionAction,
  deleteExplorationBlockAction,
  deleteExplorationOptionAction,
  deleteExplorationPageAction,
  publishExplorationAction,
  removeExplorationCollaboratorAction,
  updateExplorationBlockAction,
  updateExplorationMetadataAction,
  updateExplorationOptionAction,
  updateExplorationPageAction
} from "@/lib/actions/exploration-actions";
import { deletePlaylistAction } from "@/lib/actions/playlist-actions";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  canEditExploration,
  explorationBlockLabel,
  explorationStatusLabel
} from "@/lib/explorations";
import { canDeletePlaylist } from "@/lib/permissions";
import { SUPPORTED_CONTENT_LANGUAGES } from "@/lib/languages";

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
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function conditionFields(value: unknown) {
  const condition = objectValue(value);
  return {
    variable: typeof condition.variable === "string" ? condition.variable : "",
    operator: typeof condition.operator === "string" ? condition.operator : "equals",
    value: condition.value === undefined ? "" : String(condition.value)
  };
}

function ConditionInputs({ value }: { value: unknown }) {
  const condition = conditionFields(value);
  return (
    <div className="exploration-condition-grid">
      <label>
        <span>State variable</span>
        <input name="conditionVariable" defaultValue={condition.variable} placeholder="quiz.basics.correct" />
      </label>
      <label>
        <span>Condition</span>
        <select name="conditionOperator" defaultValue={condition.operator}>
          <option value="equals">equals</option>
          <option value="not_equals">does not equal</option>
          <option value="truthy">is true / present</option>
          <option value="falsy">is false / absent</option>
          <option value="gte">is at least</option>
          <option value="lte">is at most</option>
          <option value="contains">contains</option>
        </select>
      </label>
      <label>
        <span>Value</span>
        <input name="conditionValue" defaultValue={condition.value} placeholder="true" />
      </label>
    </div>
  );
}

function PageSelect({
  pages,
  name = "toPageId",
  defaultValue,
  excludePageId
}: {
  pages: Array<{ id: number; position: number; title: string }>;
  name?: string;
  defaultValue?: number | null;
  excludePageId?: number;
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""}>
      <option value="">Stay on this page</option>
      {pages.filter((page) => page.id !== excludePageId).map((page) => <option key={page.id} value={page.id}>{page.position}. {page.title}</option>)}
    </select>
  );
}

export default async function EditExplorationPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; view?: string }>;
}) {
  const user = await requireVerifiedUser();
  const { slug } = await params;
  const { page: selectedPageRaw, view } = await searchParams;
  const exploration = await prisma.playlist.findUnique({
    where: { slug },
    include: {
      author: true,
      collaborators: { include: { user: true }, orderBy: { createdAt: "asc" } },
      pages: {
        orderBy: { position: "asc" },
        include: {
          blocks: {
            orderBy: { position: "asc" },
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
  const requestedPageId = Number(selectedPageRaw);
  const selectedPage = exploration.pages.find((page) => page.id === requestedPageId) ?? exploration.pages[0] ?? null;
  const canDelete = canDeletePlaylist(user, exploration);
  const settingsDialogId = "exploration-settings-dialog";
  const mapMode = view === "map" || !selectedPageRaw;
  const mapPages: ExplorationMapPage[] = exploration.pages.map((page) => {
    const lastBlockPosition = page.blocks.at(-1)?.position ?? 0;
    const warnings = page.blocks.flatMap((block) => {
      const leavesPage = block.kind === ExplorationBlockKind.CHOICE
        ? block.options.some((option) => option.toPageId !== null)
        : block.kind === ExplorationBlockKind.QUIZ
          ? block.outcomes.some((outcome) => outcome.toPageId !== null)
          : false;
      return leavesPage && block.position < lastBlockPosition
        ? [`Block ${block.position} can leave this page before later content is reached.`]
        : [];
    });
    return {
      id: page.id,
      slug: page.slug,
      title: page.title,
      position: page.position,
      isStart: page.isStart,
      canvasX: page.canvasX,
      canvasY: page.canvasY,
      continueToPageId: page.continueToPageId,
      blockCount: page.blocks.length,
      choices: page.blocks
        .filter((block) => block.kind === ExplorationBlockKind.CHOICE)
        .flatMap((block) => block.options.map((option) => ({
          id: option.id,
          blockId: block.id,
          label: option.label,
          position: option.position,
          toPageId: option.toPageId
        }))),
      quizzes: page.blocks
        .filter((block) => block.kind === ExplorationBlockKind.QUIZ)
        .map((block) => ({
          blockId: block.id,
          blockPosition: block.position,
          title: block.title || `Quiz ${block.position}`,
          quizType: block.quizType,
          options: block.options.map((option) => ({
            id: option.id,
            isCorrect: option.isCorrect,
            label: option.label
          })),
          outcomes: block.outcomes.map((outcome) => ({
            id: outcome.id,
            kind: outcome.kind,
            label: outcome.label,
            optionIds: outcome.matches.map((match) => match.optionId),
            position: outcome.position,
            toPageId: outcome.toPageId
          }))
        })),
      warnings
    };
  });

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
        <div className="exploration-studio-summary">
          <span className={`exploration-status status-${exploration.status.toLocaleLowerCase()}`}>{explorationStatusLabel(exploration.status)}</span>
          <nav className="exploration-studio-view-switch" aria-label="Exploration editor view">
            <Link className={mapMode ? "button is-current" : "button secondary"} href={`/explorations/${exploration.slug}/edit?view=map` as never}><Map size={16} /> Map</Link>
            {selectedPage && <Link className={!mapMode ? "button is-current" : "button secondary"} href={`/explorations/${exploration.slug}/edit?view=page&page=${selectedPage.id}` as never}><Pencil size={16} /> Edit page</Link>}
          </nav>
        </div>
        <div className="exploration-studio-actions">
          {exploration.status !== ExplorationStatus.IN_REVIEW && (
            <form action={changeExplorationStatusAction.bind(null, exploration.id, ExplorationStatus.IN_REVIEW)}>
              <button type="submit" className="secondary"><Send size={16} /> Send for review</button>
            </form>
          )}
          {exploration.status !== ExplorationStatus.PUBLISHED && (
            <form action={publishExplorationAction.bind(null, exploration.id)}>
              <button type="submit">Publish</button>
            </form>
          )}
        </div>
      </section>

      <div className={mapMode ? "exploration-studio-shell is-map" : "exploration-studio-shell"}>
        {mapMode ? (
          <ExplorationMapCanvas explorationId={exploration.id} explorationSlug={exploration.slug} initialPages={mapPages} />
        ) : (
          <>
        <aside className="exploration-studio-sidebar">
          <div className="exploration-studio-sidebar-heading">
            <h2>Pages</h2>
          </div>
          <nav>
            {exploration.pages.map((page) => (
              <div key={page.id} className={selectedPage?.id === page.id ? "studio-page-row is-current" : "studio-page-row"}>
                <ExplorationPagePositionInput
                  max={exploration.pages.length}
                  pageId={page.id}
                  pageTitle={page.title}
                  position={page.position}
                />
                <Link href={`/explorations/${exploration.slug}/edit?view=page&page=${page.id}` as never}>
                  <span className="studio-page-title">{page.title}</span>
                </Link>
              </div>
            ))}
          </nav>
          <details className="studio-add-page">
            <summary><Plus size={16} /> New page</summary>
            <ExplorationAddPageForm explorationId={exploration.id} explorationSlug={exploration.slug} />
          </details>
        </aside>

        <div className="exploration-studio-main">
          {selectedPage ? (
            <>
              <header className="studio-canvas-heading">
                <h2>{selectedPage.title}</h2>
              </header>

              <div className="studio-page-tools">
                <details className="studio-page-settings">
                  <summary><Settings size={21} /><strong>Page settings</strong></summary>
                  <AutoSaveForm action={updateExplorationPageAction.bind(null, selectedPage.id)} className="studio-page-settings-form">
                    <label><span>Page title</span><input name="title" defaultValue={selectedPage.title} required /></label>
                    <label><span>URL slug</span><input name="slug" defaultValue={selectedPage.slug} /></label>
                    <div className="studio-page-toggles md:col-span-2">
                      <label className="checkbox-field"><input name="isStart" type="checkbox" defaultChecked={selectedPage.isStart} /><span><strong>Starting page</strong></span></label>
                    </div>
                    <details className="studio-advanced-fields md:col-span-2">
                      <summary>Conditional visibility</summary>
                      <div><p className="studio-field-group-title">Show this page only when</p><ConditionInputs value={selectedPage.visibilityRule} /></div>
                    </details>
                  </AutoSaveForm>
                  <form action={deleteExplorationPageAction.bind(null, selectedPage.id)} className="studio-page-delete">
                    <ConfirmSubmitButton message={`Delete page "${selectedPage.title}" and all of its blocks?`} className="danger" title="Delete page"><Trash2 size={16} /> Delete page</ConfirmSubmitButton>
                  </form>
                </details>
                <Link
                  href={`/explorations/${exploration.slug}/start?preview=draft` as never}
                  className="button secondary studio-page-preview-button"
                >
                  <Eye size={16} /> Preview draft
                </Link>
              </div>

              <section className="studio-block-list">
                {selectedPage.blocks.map((block) => {
                  const settings = objectValue(block.settings);
                  const blockFormId = `exploration-block-${block.id}-form`;
                  return (
                    <article key={block.id} id={`block-${block.id}`} className="studio-block-editor">
                      <div className="studio-block-topline">
                        <ExplorationBlockHeaderControls
                          blockId={block.id}
                          formId={blockFormId}
                          kind={block.kind}
                          kinds={[
                            ...(EDITOR_BLOCK_KINDS.includes(block.kind) ? [] : [{ value: block.kind, label: editorBlockLabel(block.kind) }]),
                            ...EDITOR_BLOCK_KINDS.map((kind) => ({ value: kind, label: editorBlockLabel(kind) }))
                          ]}
                          max={selectedPage.blocks.length}
                          position={block.position}
                        />
                        <div className="studio-block-actions">
                          <form action={deleteExplorationBlockAction.bind(null, block.id)}><ConfirmSubmitButton message="Delete this block?" className="icon-button danger" title="Delete block"><Trash2 size={15} /></ConfirmSubmitButton></form>
                        </div>
                      </div>
                      <AutoSaveForm action={updateExplorationBlockAction.bind(null, block.id)} className="studio-block-form" id={blockFormId}>
                        {(block.kind === ExplorationBlockKind.PROBLEM || block.kind === ExplorationBlockKind.CONCEPT) && (
                          <label><span>{block.kind === ExplorationBlockKind.PROBLEM ? "Problem" : "Concept"} slug</span><input name="referenceSlug" defaultValue={block.problem?.slug ?? block.concept?.slug ?? ""} required /></label>
                        )}
                        {block.kind !== ExplorationBlockKind.DIVIDER && block.kind !== ExplorationBlockKind.HEADING && (
                          <div className="grid gap-2"><span className="text-sm font-medium">Content</span><LazyMarkdownEditor name="bodyMarkdown" initialValue={block.bodyMarkdown ?? ""} draftKey={`exploration:block:${block.id}:body`} minHeight="8rem" lineNumbers={false} /></div>
                        )}
                        {block.kind === ExplorationBlockKind.QUIZ && (
                          <div className="studio-quiz-settings">
                            <div className="grid gap-4 md:grid-cols-3">
                              <label><span>Answer type</span><select name="quizType" defaultValue={block.quizType ?? ExplorationQuizType.SINGLE_CHOICE}>{Object.values(ExplorationQuizType).map((type) => <option key={type} value={type}>{type.toLocaleLowerCase().replaceAll("_", " ")}</option>)}</select></label>
                              <label><span>Expected text / number</span><input name="expectedAnswer" defaultValue={String(settings.expectedAnswer ?? "")} /></label>
                              <label><span>Numeric tolerance</span><input name="tolerance" type="number" step="any" min={0} defaultValue={String(settings.tolerance ?? "")} /></label>
                            </div>
                            <label className="checkbox-field"><input name="caseSensitive" type="checkbox" defaultChecked={settings.caseSensitive === true} /><span><strong>Case-sensitive text answer</strong></span></label>
                            <div className="grid gap-2"><span className="text-sm font-medium">Explanation after answering</span><LazyMarkdownEditor name="explanationMarkdown" initialValue={block.explanationMarkdown ?? ""} draftKey={`exploration:block:${block.id}:explanation`} minHeight="6rem" lineNumbers={false} /></div>
                          </div>
                        )}
                      </AutoSaveForm>

                      {(block.kind === ExplorationBlockKind.QUIZ || block.kind === ExplorationBlockKind.CHOICE) && (
                        <details className="studio-option-editor" open={block.options.length === 0}>
                          <summary>{block.kind === ExplorationBlockKind.QUIZ ? "Answers" : "Paths"} <span>{block.options.length}</span></summary>
                          <div className="studio-option-editor-body">
                          {block.options.map((option) => {
                            return (
                              <div key={option.id} className="studio-option-row">
                                <AutoSaveForm action={updateExplorationOptionAction.bind(null, option.id)} className="studio-option-autosave-form" statusClassName="sr-only">
                                <label><span>Label</span><input name="label" defaultValue={option.label} required /></label>
                                {block.kind === ExplorationBlockKind.CHOICE && <label><span>Send to</span><PageSelect pages={exploration.pages} defaultValue={option.toPageId} excludePageId={selectedPage.id} /></label>}
                                {block.kind === ExplorationBlockKind.QUIZ && <label className="checkbox-field"><input name="isCorrectField" type="hidden" value="true" /><input name="isCorrect" type="checkbox" defaultChecked={option.isCorrect === true} /><span><strong>Correct</strong></span></label>}
                                </AutoSaveForm>
                                <form action={deleteExplorationOptionAction.bind(null, option.id)} className="studio-option-delete">
                                  <ConfirmSubmitButton message="Delete this option?" className="icon-button danger" title="Delete option"><Trash2 size={15} /></ConfirmSubmitButton>
                                </form>
                              </div>
                            );
                          })}
                          <form action={createExplorationOptionAction.bind(null, block.id)} className="studio-new-option">
                            <label><span>New label</span><input name="label" required placeholder={block.kind === ExplorationBlockKind.QUIZ ? "An answer" : "Take this path"} /></label>
                            {block.kind === ExplorationBlockKind.CHOICE && <label><span>Send to</span><PageSelect pages={exploration.pages} excludePageId={selectedPage.id} /></label>}
                            {block.kind === ExplorationBlockKind.QUIZ && <label className="checkbox-field"><input name="isCorrect" type="checkbox" /><span><strong>Correct answer</strong></span></label>}
                            <button type="submit" className="secondary"><Plus size={15} /> Add option</button>
                          </form>
                          </div>
                        </details>
                      )}
                    </article>
                  );
                })}
                {selectedPage.blocks.length === 0 && <p className="muted studio-empty-state">This page is empty. Add its first block below.</p>}
              </section>

              <details className="studio-add-block">
                <summary><Plus size={18} /><strong>Add block</strong></summary>
                <ExplorationAddContentForm
                  explorationSlug={exploration.slug}
                  pageId={selectedPage.id}
                  kinds={ADD_BLOCK_KINDS.map((kind) => ({ value: kind, label: editorBlockLabel(kind) }))}
                />
              </details>
            </>
          ) : (
            <p className="muted studio-empty-state">Add the first page to begin writing.</p>
          )}
        </div>
          </>
        )}

        <dialog className="exploration-settings-dialog" id={settingsDialogId}>
            <header className="exploration-settings-dialog-header">
              <h2>Exploration settings</h2>
              <form method="dialog">
                <button className="icon-button secondary" type="submit" title="Close settings" aria-label="Close settings"><X size={18} /></button>
              </form>
            </header>
            <div className="studio-project-tools-body exploration-settings-dialog-body">
          <details className="studio-project-section">
            <summary><Settings size={17} /> Exploration details</summary>
            <AutoSaveForm action={updateExplorationMetadataAction.bind(null, exploration.id)} className="studio-metadata-form">
              <div className="grid gap-4 md:grid-cols-2">
                <label><span>Title</span><input name="title" defaultValue={exploration.title} required /></label>
                <label><span>Short summary</span><input name="summary" defaultValue={exploration.summary ?? ""} /></label>
                <label><span>Domain</span><select name="domain" defaultValue={exploration.domain}>{Object.values(MathDomain).map((domain) => <option key={domain} value={domain}>{domain.toLocaleLowerCase()}</option>)}</select></label>
                <label><span>Audience</span><input name="audience" defaultValue={exploration.audience ?? ""} placeholder="Undergraduate algebra" /></label>
                <label><span>Estimated minutes</span><input name="estimatedMinutes" type="number" min={1} defaultValue={exploration.estimatedMinutes ?? ""} /></label>
                <label><span>Difficulty / 100</span><input name="difficulty" type="number" min={0} max={100} defaultValue={exploration.difficulty ?? ""} /></label>
                <label><span>Visibility</span><select name="visibility" defaultValue={exploration.visibility}>{Object.values(PlaylistVisibility).map((visibility) => <option key={visibility} value={visibility}>{visibility.toLocaleLowerCase()}</option>)}</select></label>
                <label><span>License</span><input name="license" defaultValue={exploration.license} /></label>
              </div>
              <label><span>Cover image URL</span><input name="coverImageUrl" defaultValue={exploration.coverImageUrl ?? ""} placeholder="https://..." /></label>
              <div className="grid gap-2"><span className="text-sm font-medium">Catalogue introduction</span><LazyMarkdownEditor name="descriptionMarkdown" initialValue={exploration.descriptionMarkdown} draftKey={`exploration:${exploration.id}:metadata:description`} minHeight="10rem" /></div>
              <div className="grid gap-2"><span className="text-sm font-medium">Prerequisites</span><LazyMarkdownEditor name="prerequisitesMarkdown" initialValue={exploration.prerequisitesMarkdown ?? ""} draftKey={`exploration:${exploration.id}:metadata:prerequisites`} minHeight="7rem" lineNumbers={false} /></div>
            </AutoSaveForm>
          </details>
          <section className="studio-collaborators">
            <div className="studio-section-heading"><h2>Collaborators</h2></div>
            <div className="studio-collaborator-list">
              <div><strong>{exploration.author.displayName || exploration.author.username}</strong><span>Owner</span></div>
              {exploration.collaborators.map((collaborator) => (
                <div key={collaborator.userId}>
                  <strong>{collaborator.user.displayName || collaborator.user.username}</strong><span>{collaborator.role.toLocaleLowerCase()}</span>
                  <form action={removeExplorationCollaboratorAction.bind(null, exploration.id, collaborator.userId)}><button className="icon-button danger" title="Remove collaborator"><Trash2 size={15} /></button></form>
                </div>
              ))}
            </div>
            <form action={addExplorationCollaboratorAction.bind(null, exploration.id)} className="studio-add-collaborator">
              <input name="username" required placeholder="Username" aria-label="Collaborator username" />
              <select name="role" aria-label="Collaborator role"><option value="EDITOR">Editor</option><option value="REVIEWER">Reviewer</option></select>
              <button type="submit" className="secondary"><Plus size={16} /> Add collaborator</button>
            </form>
          </section>

          <section className="studio-translation-tools">
            <div className="studio-section-heading"><h2>Translation</h2></div>
            <form action={cloneExplorationTranslationAction.bind(null, exploration.id)}>
              <select name="language" defaultValue="" required>
                <option value="" disabled>Choose language</option>
                {SUPPORTED_CONTENT_LANGUAGES.filter((language) => language.code !== exploration.language).map((language) => (
                  <option key={language.code} value={language.code}>{language.label}</option>
                ))}
              </select>
              <button type="submit" className="secondary"><Plus size={16} /> Create translation draft</button>
            </form>
          </section>

          {canDelete && (
            <section className="danger-zone">
              <div><h2>Archive or delete exploration</h2><p>Archiving hides the exploration while preserving its change history and reader progress.</p></div>
              <div className="flex flex-wrap gap-2">
                <form action={changeExplorationStatusAction.bind(null, exploration.id, ExplorationStatus.ARCHIVED)}><button type="submit" className="secondary">Archive</button></form>
                <form action={deletePlaylistAction.bind(null, exploration.id)}><DeletePlaylistButton title={exploration.title} /></form>
              </div>
            </section>
            )}
            </div>
        </dialog>
      </div>
    </ForestPageLayout>
  );
}
