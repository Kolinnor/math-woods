import Link from "next/link";

export function ContributionTasksTabs({
  current,
  labels,
  showSiteImprovements
}: {
  current: "content" | "site";
  labels: { content: string; site: string };
  showSiteImprovements: boolean;
}) {
  return (
    <nav className="contribution-tasks-tabs" aria-label="Work to do">
      <Link
        href="/contributing/tasks"
        aria-current={current === "content" ? "page" : undefined}
      >
        {labels.content}
      </Link>
      {showSiteImprovements && (
        <Link
          href={"/contributing/tasks/site-improvements" as never}
          aria-current={current === "site" ? "page" : undefined}
        >
          {labels.site}
        </Link>
      )}
    </nav>
  );
}
