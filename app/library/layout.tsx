import type { ReactNode } from "react";

export default async function LibraryLayout({ children }: { children: ReactNode }) {
  return <div className="library-root">{children}</div>;
}
