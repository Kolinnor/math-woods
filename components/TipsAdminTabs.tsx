import Link from "next/link";

type TipsAdminTabsProps = {
  active: "library" | "daily-problem";
};

export function TipsAdminTabs({ active }: TipsAdminTabsProps) {
  return (
    <nav className="tips-admin-tabs" aria-label="Tips administration">
      <Link href="/tips" aria-current={active === "library" ? "page" : undefined}>
        Tips library
      </Link>
      <Link
        href="/tips/problem-of-the-day"
        aria-current={active === "daily-problem" ? "page" : undefined}
      >
        Problem of the day
      </Link>
    </nav>
  );
}
