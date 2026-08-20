import {
  SiteImprovementActivityType,
  SiteImprovementPriority,
  SiteImprovementStatus
} from "@prisma/client";
import { ArrowLeft, Check, MessageCircle, Send, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { UserName } from "@/components/UserName";
import {
  claimSiteImprovementAction,
  createSiteImprovementCommentAction,
  releaseSiteImprovementAction,
  updateSiteImprovementDetailsAction,
  updateSiteImprovementPriorityAction,
  updateSiteImprovementStatusAction
} from "@/lib/actions/site-improvement-actions";
import { requireModerator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";
import { getRequestTimeZone } from "@/lib/server-time-zone";
import {
  SITE_IMPROVEMENT_PRIORITY_ORDER,
  SITE_IMPROVEMENT_STATUS_ORDER,
  siteImprovementCopy
} from "@/lib/site-improvements";

export const dynamic = "force-dynamic";

function activityValue(
  value: string | null,
  type: SiteImprovementActivityType,
  copy: ReturnType<typeof siteImprovementCopy>
) {
  if (!value) return null;
  if (type === SiteImprovementActivityType.STATUS_CHANGED && value in copy.statuses) {
    return copy.statuses[value as SiteImprovementStatus];
  }
  if (type === SiteImprovementActivityType.PRIORITY_CHANGED && value in copy.priorities) {
    return copy.priorities[value as SiteImprovementPriority];
  }
  return null;
}

export default async function SiteImprovementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const improvementId = Number(idParam);
  if (!Number.isInteger(improvementId) || improvementId <= 0) notFound();

  const [user, interfaceLocale, timeZone] = await Promise.all([
    requireModerator(),
    getInterfaceLocale(),
    getRequestTimeZone()
  ]);
  const copy = siteImprovementCopy(interfaceLocale);
  const improvement = await prisma.siteImprovement.findUnique({
    where: { id: improvementId },
    include: {
      creator: true,
      assignee: true,
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      activities: { include: { actor: true }, orderBy: { createdAt: "desc" }, take: 60 }
    }
  });
  if (!improvement) notFound();

  const dateFormatter = new Intl.DateTimeFormat(interfaceLocale === "fr" ? "fr-FR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timeZone ?? undefined
  });
  const canRelease = Boolean(
    improvement.status !== SiteImprovementStatus.COMPLETED &&
    improvement.assigneeId &&
    (improvement.assigneeId === user.id || canUseAdminTools(user))
  );
  const canEditDetails = improvement.creatorId === user.id || canUseAdminTools(user);

  const sidebar = (
    <div className="site-improvement-sidebar">
      <section>
        <h2>{copy.details}</h2>
        <form action={updateSiteImprovementStatusAction.bind(null, improvement.id)}>
          <label>
            <span>{copy.changeStatus}</span>
            <select name="status" defaultValue={improvement.status}>
              {SITE_IMPROVEMENT_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>{copy.statuses[status]}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="secondary"><Check size={15} />{copy.apply}</button>
        </form>
        <form action={updateSiteImprovementPriorityAction.bind(null, improvement.id)}>
          <label>
            <span>{copy.changePriority}</span>
            <select name="priority" defaultValue={improvement.priority}>
              {SITE_IMPROVEMENT_PRIORITY_ORDER.map((priority) => (
                <option key={priority} value={priority}>{copy.priorities[priority]}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="secondary"><Check size={15} />{copy.apply}</button>
        </form>
        <div className="site-improvement-assignee">
          <span>{copy.assignedTo}</span>
          {improvement.assignee ? <UserName user={improvement.assignee} /> : <strong>{copy.unassigned}</strong>}
        </div>
        {!improvement.assignee && improvement.status !== SiteImprovementStatus.COMPLETED && (
          <form action={claimSiteImprovementAction.bind(null, improvement.id)}>
            <button type="submit"><UserPlus size={16} />{copy.claim}</button>
          </form>
        )}
        {canRelease && (
          <form action={releaseSiteImprovementAction.bind(null, improvement.id)}>
            <button type="submit" className="secondary"><UserMinus size={16} />{copy.release}</button>
          </form>
        )}
      </section>

      <section>
        <h2>{copy.history}</h2>
        <ol className="site-improvement-history">
          {improvement.activities.map((activity) => {
            const from = activityValue(activity.fromValue, activity.type, copy);
            const to = activityValue(activity.toValue, activity.type, copy);
            return (
              <li key={activity.id}>
                <p>
                  {activity.actor ? <UserName user={activity.actor} /> : copy.formerUser}{" "}
                  {copy.activity[activity.type]}
                  {from && to ? `: ${from} → ${to}` : to ? `: ${to}` : ""}
                </p>
                <time dateTime={activity.createdAt.toISOString()}>{dateFormatter.format(activity.createdAt)}</time>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );

  return (
    <ForestPageLayout
      className="site-improvement-detail-page"
      title={improvement.title}
      eyebrow={`${copy.title} · #${improvement.id}`}
      description={`${copy.statuses[improvement.status]} · ${copy.priorities[improvement.priority]}`}
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      titleBelowHero
      sidebar={sidebar}
      actions={
        <Link href={"/contributing/tasks/site-improvements" as never} className="button secondary">
          <ArrowLeft size={16} aria-hidden="true" />
          {copy.back}
        </Link>
      }
    >
      <section className="site-improvement-description">
        <MarkdownBlock html={improvement.descriptionHtml} />
        <p className="site-improvement-description-meta">
          {copy.createdBy}{" "}
          {improvement.creator ? <UserName user={improvement.creator} /> : copy.formerUser}
          {" · "}{dateFormatter.format(improvement.createdAt)}
        </p>
        {canEditDetails && (
          <details className="site-improvement-edit-details">
            <summary>{copy.edit}</summary>
            <form action={updateSiteImprovementDetailsAction.bind(null, improvement.id)}>
              <label>
                <span>{copy.titleLabel}</span>
                <input name="title" defaultValue={improvement.title} maxLength={160} required />
              </label>
              <label>
                <span>{copy.descriptionLabel}</span>
                <textarea
                  name="descriptionMarkdown"
                  defaultValue={improvement.descriptionMarkdown}
                  maxLength={4000}
                  required
                />
              </label>
              <button type="submit" className="secondary">{copy.save}</button>
            </form>
          </details>
        )}
      </section>

      <section className="site-improvement-discussion">
        <header>
          <MessageCircle size={20} aria-hidden="true" />
          <h2>{copy.discussion}</h2>
          <span>{improvement.comments.length}</span>
        </header>
        <div className="discussion-thread">
          {improvement.comments.map((comment) => (
            <article key={comment.id} id={`comment-${comment.id}`} className="discussion-post">
              <header className="discussion-post-header">
                <div className="discussion-post-author">
                  {comment.author ? (
                    <Link href={`/profile/${comment.author.profileSlug}`}><UserName user={comment.author} /></Link>
                  ) : copy.formerUser}
                  <time dateTime={comment.createdAt.toISOString()}>{dateFormatter.format(comment.createdAt)}</time>
                </div>
              </header>
              <div className="discussion-post-body"><MarkdownBlock html={comment.bodyHtml} /></div>
            </article>
          ))}
          {improvement.comments.length === 0 && (
            <div className="discussion-empty-state">
              <MessageCircle size={24} aria-hidden="true" />
              <p>{copy.noMessages}</p>
            </div>
          )}
        </div>
      </section>

      <form action={createSiteImprovementCommentAction.bind(null, improvement.id)} className="discussion-composer">
        <h2>{copy.addMessage}</h2>
        <LazyMarkdownEditor
          name="bodyMarkdown"
          minHeight="9rem"
          lineNumbers={false}
          draftKey={`site-improvement:${improvement.id}:comment`}
          resetSignal={improvement.comments.filter((comment) => comment.authorId === user.id).at(-1)?.id ?? 0}
        />
        <div className="discussion-composer-actions">
          <button type="submit"><Send size={16} aria-hidden="true" />{copy.publish}</button>
        </div>
      </form>
    </ForestPageLayout>
  );
}
