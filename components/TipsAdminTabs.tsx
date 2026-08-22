import Link from "next/link";
import type { Route } from "next";

type TipsAdminTabsProps = {
  active: "library" | "daily-tip" | "daily-problem" | "priorities";
};

export function TipsAdminTabs({ active }: TipsAdminTabsProps) {
  return (
    <nav className="tips-admin-tabs" aria-label="Tips administration">
      <Link href="/tips" aria-current={active === "library" ? "page" : undefined}>
        Tips library
      </Link>
      <Link
        href="/tips/tip-of-the-day"
        aria-current={active === "daily-tip" ? "page" : undefined}
      >
        Tip of the day
      </Link>
      <Link
        href="/tips/problem-of-the-day"
        aria-current={active === "daily-problem" ? "page" : undefined}
      >
        Problem of the day
      </Link>
      <Link
        href={"/tips/priorities" as Route}
        aria-current={active === "priorities" ? "page" : undefined}
      >
        Priorities
      </Link>
    </nav>
  );
}
