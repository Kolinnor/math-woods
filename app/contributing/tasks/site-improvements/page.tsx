import { SiteImprovementPriority, SiteImprovementStatus } from "@prisma/client";
import { MessageCircle, Plus, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { ContributionTasksTabs } from "@/components/ContributionTasksTabs";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { UserName } from "@/components/UserName";
import {
  claimSiteImprovementAction,
  createSiteImprovementAction,
  releaseSiteImprovementAction
} from "@/lib/actions/site-improvement-actions";
import { requireModerator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import {
  SITE_IMPROVEMENT_PRIORITY_ORDER,
  SITE_IMPROVEMENT_STATUS_ORDER,
  siteImprovementCopy
} from "@/lib/site-improvements";

export const dynamic = "force-dynamic";

const priorityRank = new Map(SITE_IMPROVEMENT_PRIORITY_ORDER.map((priority, index) => [priority, index]));

export default async function SiteImprovementsPage() {
  const [user, interfaceLocale] = await Promise.all([requireModerator(), getInterfaceLocale()]);
  const copy = siteImprovementCopy(interfaceLocale);
  const [activeItems, completedItems] = await Promise.all([
    prisma.siteImprovement.findMany({
      where: { status: { not: SiteImprovementStatus.COMPLETED } },
      include: {
        creator: true,
        assignee: true,
        _count: { select: { comments: true } }
      },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.siteImprovement.findMany({
      where: { status: SiteImprovementStatus.COMPLETED },
      include: {
        creator: true,
        assignee: true,
        _count: { select: { comments: true } }
      },
      orderBy: { completedAt: "desc" }
    })
  ]);
  const items = [...activeItems, ...completedItems];
  const grouped = new Map(
    SITE_IMPROVEMENT_STATUS_ORDER.map((status) => [
      status,
      items
        .filter((item) => item.status === status)
        .sort((left, right) =>
          (priorityRank.get(left.priority) ?? 1) - (priorityRank.get(right.priority) ?? 1) ||
          right.updatedAt.getTime() - left.updatedAt.getTime()
        )
    ])
  );

  return (
    <ForestPageLayout
      className="site-improvements-page"
      title={copy.title}
      eyebrow={copy.eyebrow}
      description={copy.description}
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      meta={
        <p>
          {interfaceLocale === "fr"
            ? `${activeItems.length} amélioration${activeItems.length === 1 ? "" : "s"} active${activeItems.length === 1 ? "" : "s"}`
            : `${activeItems.length} active improvement${activeItems.length === 1 ? "" : "s"}`}
        </p>
      }
    >
      <ContributionTasksTabs
        current="site"
        labels={{ content: copy.tabTasks, site: copy.tabImprovements }}
        showSiteImprovements
      />

      <details className="site-improvement-create">
        <summary>
          <Plus size={17} aria-hidden="true" />
          {copy.create}
        </summary>
        <form action={createSiteImprovementAction}>
          <h2>{copy.createTitle}</h2>
          <label>
            <span>{copy.titleLabel}</span>
            <input name="title" maxLength={160} required />
          </label>
          <label>
            <span>{copy.descriptionLabel}</span>
            <textarea name="descriptionMarkdown" maxLength={4000} required />
          </label>
          <label>
            <span>{copy.priorityLabel}</span>
            <select name="priority" defaultValue={SiteImprovementPriority.NORMAL}>
              {SITE_IMPROVEMENT_PRIORITY_ORDER.map((priority) => (
                <option key={priority} value={priority}>{copy.priorities[priority]}</option>
              ))}
            </select>
          </label>
          <button type="submit">{copy.add}</button>
        </form>
      </details>

      <div className="site-improvement-board">
        {SITE_IMPROVEMENT_STATUS_ORDER.map((status) => {
          const statusItems = grouped.get(status) ?? [];
          return (
            <section key={status} className={`site-improvement-column status-${status.toLowerCase().replace("_", "-")}`}>
              <header>
                <h2>{copy.statuses[status]}</h2>
                <span>{statusItems.length}</span>
              </header>
              <div className="site-improvement-list">
                {statusItems.map((item) => (
                  <article key={item.id} className="site-improvement-card">
                    <div className="site-improvement-card-meta">
                      <span className={`site-improvement-priority priority-${item.priority.toLowerCase()}`}>
                        {copy.priorities[item.priority]}
                      </span>
                      <span>#{item.id}</span>
                    </div>
                    <h3><Link href={`/contributing/tasks/site-improvements/${item.id}` as never}>{item.title}</Link></h3>
                    <p>
                      {item.assignee ? (
                        <><span>{copy.assignedTo}</span> <UserName user={item.assignee} /></>
                      ) : item.creator ? (
                        <><span>{copy.createdBy}</span> <UserName user={item.creator} /></>
                      ) : copy.formerUser}
                    </p>
                    <footer>
                      <Link href={`/contributing/tasks/site-improvements/${item.id}` as never} className="site-improvement-discussion-link">
                        <MessageCircle size={15} aria-hidden="true" />
                        {copy.discussion} <span>{item._count.comments}</span>
                      </Link>
                      {!item.assignee && status !== SiteImprovementStatus.COMPLETED && (
                        <form action={claimSiteImprovementAction.bind(null, item.id)}>
                          <button type="submit" className="site-improvement-icon-action" title={copy.claim} aria-label={copy.claim}>
                            <UserPlus size={16} aria-hidden="true" />
                          </button>
                        </form>
                      )}
                      {item.assignee && status !== SiteImprovementStatus.COMPLETED && (item.assigneeId === user.id || user.role === "ADMIN" || user.role === "OWNER") && (
                        <form action={releaseSiteImprovementAction.bind(null, item.id)}>
                          <button type="submit" className="site-improvement-icon-action" title={copy.release} aria-label={copy.release}>
                            <UserMinus size={16} aria-hidden="true" />
                          </button>
                        </form>
                      )}
                    </footer>
                  </article>
                ))}
                {statusItems.length === 0 && <p className="site-improvement-empty">{copy.noItems}</p>}
              </div>
            </section>
          );
        })}
      </div>
    </ForestPageLayout>
  );
}
