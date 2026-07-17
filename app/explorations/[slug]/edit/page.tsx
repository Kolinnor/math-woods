import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  FileClock,
  Plus,
  Send,
  Settings,
  Trash2
} from "lucide-react";
import {
  ExplorationBlockKind,
  ExplorationQuizType,
  ExplorationStatus,
  MathDomain,
  PlaylistVisibility
} from "@prisma/client";
import { notFound } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { DeletePlaylistButton } from "@/components/DeletePlaylistButton";
import { ExplorationAddContentForm } from "@/components/ExplorationAddContentForm";
import { ExplorationAddPageForm } from "@/components/ExplorationAddPageForm";
import { ExplorationPagePositionInput } from "@/components/ExplorationPagePositionInput";
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
  moveExplorationBlockAction,
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

const EDITOR_BLOCK_KINDS: ExplorationBlockKind[] = [
  ExplorationBlockKind.MARKDOWN,
  ExplorationBlockKind.PROBLEM,
  ExplorationBlockKind.CONCEPT,
  ExplorationBlockKind.CHOICE
];

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

function effectFields(value: unknown) {
  const effect = Array.isArray(value) ? objectValue(value[0]) : {};
  return {
    variable: typeof effect.variable === "string" ? effect.variable : "",
    operation: typeof effect.operation === "string" ? effect.operation : "set",
    value: effect.value === undefined ? "" : String(effect.value)
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
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireVerifiedUser();
  const { slug } = await params;
  const { page: selectedPageRaw } = await searchParams;
  const exploration = await prisma.playlist.findUnique({
    where: { slug },
    include: {
      author: true,
      collaborators: { include: { user: true }, orderBy: { createdAt: "asc" } },
      editions: { orderBy: { version: "desc" }, take: 1 },
      pages: {
        orderBy: { position: "asc" },
        include: {
          blocks: {
            orderBy: { position: "asc" },
            include: {
              problem: { select: { slug: true, title: true } },
              concept: { select: { slug: true, title: true } },
              options: { orderBy: { position: "asc" } }
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
  const latestVersion = exploration.editions[0]?.version ?? 0;

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
          <Link href={`/explorations/${exploration.slug}/start?preview=draft` as never} className="button secondary"><Eye size={16} /> Preview draft</Link>
          <Link href={`/explorations/${exploration.slug}/history` as never} className="button secondary"><FileClock size={16} /> Editions</Link>
        </>
      }
    >
      <section className="exploration-studio-toolbar">
        <div className="exploration-studio-summary">
          <span className={`exploration-status status-${exploration.status.toLocaleLowerCase()}`}>{explorationStatusLabel(exploration.status)}</span>
        </div>
        <div className="exploration-studio-actions">
          {exploration.status !== ExplorationStatus.IN_REVIEW && (
            <form action={changeExplorationStatusAction.bind(null, exploration.id, ExplorationStatus.IN_REVIEW)}>
              <button type="submit" className="secondary"><Send size={16} /> Send for review</button>
            </form>
          )}
          <details className="studio-publish-menu">
            <summary className="button">Publish</summary>
            <form action={publishExplorationAction.bind(null, exploration.id)}>
              <strong>Publish edition {latestVersion + 1}</strong>
              <input name="changeSummary" placeholder="What changed?" aria-label="Edition change summary" />
              <button type="submit">Publish edition {latestVersion + 1}</button>
            </form>
          </details>
        </div>
      </section>

      <div className="exploration-studio-shell">
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
                <Link href={`/explorations/${exploration.slug}/edit?page=${page.id}` as never}>
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

              <details className="studio-page-settings">
                <summary><Settings size={16} /><strong>Page settings</strong></summary>
                <form action={updateExplorationPageAction.bind(null, selectedPage.id)} className="studio-page-settings-form">
                  <label><span>Page title</span><input name="title" defaultValue={selectedPage.title} required /></label>
                  <label><span>URL slug</span><input name="slug" defaultValue={selectedPage.slug} /></label>
                  <label className="md:col-span-2"><span>Summary</span><input name="summary" defaultValue={selectedPage.summary ?? ""} /></label>
                  <label className="checkbox-field md:col-span-2"><input name="isStart" type="checkbox" defaultChecked={selectedPage.isStart} /><span><strong>Starting page</strong></span></label>
                  <label className="checkbox-field md:col-span-2"><input name="isEnd" type="checkbox" defaultChecked={selectedPage.isEnd} /><span><strong>Ending page</strong></span></label>
                  <details className="studio-advanced-fields md:col-span-2">
                    <summary>Conditional visibility</summary>
                    <div><p className="studio-field-group-title">Show this page only when</p><ConditionInputs value={selectedPage.visibilityRule} /></div>
                  </details>
                  <div className="studio-form-actions md:col-span-2">
                    <button type="submit">Save page settings</button>
                  </div>
                </form>
                <form action={deleteExplorationPageAction.bind(null, selectedPage.id)} className="studio-page-delete">
                  <ConfirmSubmitButton message={`Delete page "${selectedPage.title}" and all of its blocks?`} className="danger" title="Delete page"><Trash2 size={16} /> Delete page</ConfirmSubmitButton>
                </form>
              </details>

              <section className="studio-block-list">
                {selectedPage.blocks.map((block) => {
                  const settings = objectValue(block.settings);
                  const titleInputId = `exploration-block-${block.id}-title`;
                  return (
                    <article key={block.id} id={`block-${block.id}`} className="studio-block-editor">
                      <div className="studio-block-topline">
                        <label htmlFor={titleInputId}>Title</label>
                        <div className="studio-block-actions">
                          <form action={moveExplorationBlockAction.bind(null, block.id, "up")}><button className="icon-button secondary" title="Move block up"><ArrowUp size={15} /></button></form>
                          <form action={moveExplorationBlockAction.bind(null, block.id, "down")}><button className="icon-button secondary" title="Move block down"><ArrowDown size={15} /></button></form>
                          <form action={deleteExplorationBlockAction.bind(null, block.id)}><ConfirmSubmitButton message="Delete this block?" className="icon-button danger" title="Delete block"><Trash2 size={15} /></ConfirmSubmitButton></form>
                        </div>
                      </div>
                      <form action={updateExplorationBlockAction.bind(null, block.id)} className="studio-block-form">
                        <input id={titleInputId} name="title" defaultValue={block.title ?? ""} placeholder={explorationBlockLabel(block.kind)} />
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
                        <details className="studio-advanced-fields">
                          <summary>Advanced settings</summary>
                          <div className="grid gap-4 md:grid-cols-3">
                            <label><span>Block type</span><select name="kind" defaultValue={block.kind}>{[
                              ...(EDITOR_BLOCK_KINDS.includes(block.kind) ? [] : [block.kind]),
                              ...EDITOR_BLOCK_KINDS
                            ].map((kind) => <option key={kind} value={kind}>{editorBlockLabel(kind)}</option>)}</select></label>
                            <label><span>Points</span><input name="points" type="number" min={0} defaultValue={block.points} /></label>
                            <label className="checkbox-field"><input name="required" type="checkbox" defaultChecked={block.required} /><span><strong>Required before continuing</strong></span></label>
                          </div>
                          <div><p className="studio-field-group-title">Show this block only when</p><ConditionInputs value={block.visibilityRule} /></div>
                        </details>
                        <div className="studio-block-save"><button type="submit">Save</button></div>
                      </form>

                      {(block.kind === ExplorationBlockKind.QUIZ || block.kind === ExplorationBlockKind.CHOICE) && (
                        <details className="studio-option-editor" open={block.options.length === 0}>
                          <summary>{block.kind === ExplorationBlockKind.QUIZ ? "Answers" : "Paths"} <span>{block.options.length}</span></summary>
                          <div className="studio-option-editor-body">
                          {block.options.map((option) => {
                            const effect = effectFields(option.effects);
                            return (
                              <form key={option.id} action={updateExplorationOptionAction.bind(null, option.id)} className="studio-option-row">
                                <label><span>Label</span><input name="label" defaultValue={option.label} required /></label>
                                <label><span>Send to</span><PageSelect pages={exploration.pages} defaultValue={option.toPageId} excludePageId={selectedPage.id} /></label>
                                {block.kind === ExplorationBlockKind.QUIZ && <label className="checkbox-field"><input name="isCorrect" type="checkbox" defaultChecked={option.isCorrect === true} /><span><strong>Correct</strong></span></label>}
                                <details className="studio-option-advanced">
                                  <summary>More</summary>
                                  <div className="studio-option-advanced-grid">
                                    <label><span>Value</span><input name="value" defaultValue={option.value ?? ""} /></label>
                                    <label><span>Feedback</span><input name="feedbackMarkdown" defaultValue={option.feedbackMarkdown ?? ""} /></label>
                                    <label><span>Set variable</span><input name="effectVariable" defaultValue={effect.variable} placeholder="needs_review" /></label>
                                    <label><span>Operation</span><select name="effectOperation" defaultValue={effect.operation}><option value="set">set</option><option value="increment">increment</option><option value="append">append</option><option value="remove">remove</option></select></label>
                                    <label><span>Value</span><input name="effectValue" defaultValue={effect.value} placeholder="true" /></label>
                                  </div>
                                </details>
                                <div className="studio-option-actions">
                                  <button type="submit" className="secondary">Save</button>
                                  <button formAction={deleteExplorationOptionAction.bind(null, option.id)} className="icon-button danger" title="Delete option"><Trash2 size={15} /></button>
                                </div>
                              </form>
                            );
                          })}
                          <form action={createExplorationOptionAction.bind(null, block.id)} className="studio-new-option">
                            <label><span>New label</span><input name="label" required placeholder={block.kind === ExplorationBlockKind.QUIZ ? "An answer" : "Take this path"} /></label>
                            <label><span>Send to</span><PageSelect pages={exploration.pages} excludePageId={selectedPage.id} /></label>
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
                <summary><Plus size={18} /><strong>Add content</strong></summary>
                <ExplorationAddContentForm
                  explorationSlug={exploration.slug}
                  pageId={selectedPage.id}
                  kinds={EDITOR_BLOCK_KINDS.map((kind) => ({ value: kind, label: editorBlockLabel(kind) }))}
                />
              </details>
            </>
          ) : (
            <p className="muted studio-empty-state">Add the first page to begin writing.</p>
          )}

          <details className="studio-project-tools">
            <summary><Settings size={17} /><strong>Exploration settings</strong></summary>
            <div className="studio-project-tools-body">
          <details className="studio-project-section">
            <summary><Settings size={17} /> Exploration details</summary>
            <form action={updateExplorationMetadataAction.bind(null, exploration.id)} className="studio-metadata-form">
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
              <button type="submit">Save exploration details</button>
            </form>
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
              <div><h2>Archive or delete exploration</h2><p>Archiving hides the exploration while preserving editions and reader history.</p></div>
              <div className="flex flex-wrap gap-2">
                <form action={changeExplorationStatusAction.bind(null, exploration.id, ExplorationStatus.ARCHIVED)}><button type="submit" className="secondary">Archive</button></form>
                <form action={deletePlaylistAction.bind(null, exploration.id)}><DeletePlaylistButton title={exploration.title} /></form>
              </div>
            </section>
          )}
            </div>
          </details>
        </div>
      </div>
    </ForestPageLayout>
  );
}
