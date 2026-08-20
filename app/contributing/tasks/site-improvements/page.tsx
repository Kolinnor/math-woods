import { SiteImprovementPriority, SiteImprovementStatus } from "@prisma/client";
import { MessageCircle, Plus } from "lucide-react";
import Link from "next/link";
import { ContributionTasksTabs } from "@/components/ContributionTasksTabs";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { createSiteImprovementAction } from "@/lib/actions/site-improvement-actions";
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
  const [, interfaceLocale] = await Promise.all([requireModerator(), getInterfaceLocale()]);
  const copy = siteImprovementCopy(interfaceLocale);
  const [activeItems, completedItems] = await Promise.all([
    prisma.siteImprovement.findMany({
      where: { status: { not: SiteImprovementStatus.COMPLETED } },
      include: {
        _count: { select: { comments: true } }
      },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.siteImprovement.findMany({
      where: { status: SiteImprovementStatus.COMPLETED },
      include: {
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
                    <Link href={`/contributing/tasks/site-improvements/${item.id}` as never} className="site-improvement-card-link">
                      <span className={`site-improvement-priority priority-${item.priority.toLowerCase()}`}>
                        {copy.priorities[item.priority]}
                      </span>
                      <h3>{item.title}</h3>
                      <span
                        className="site-improvement-comment-count"
                        title={copy.comments(item._count.comments)}
                        aria-label={copy.comments(item._count.comments)}
                      >
                        <MessageCircle size={15} aria-hidden="true" />
                        {item._count.comments}
                      </span>
                    </Link>
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
