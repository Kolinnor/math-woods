import { notFound } from "next/navigation";
import { EXPLORATIONS_ENABLED } from "@/lib/feature-flags";

export default function ExplorationsLayout({ children }: { children: React.ReactNode }) {
  if (!EXPLORATIONS_ENABLED) notFound();

  return children;
}
