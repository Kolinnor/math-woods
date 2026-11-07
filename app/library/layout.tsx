import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireModerator } from "@/lib/auth";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LibraryLayout({ children }: { children: ReactNode }) {
  await requireModerator();
  return <div className="library-root">{children}</div>;
}
