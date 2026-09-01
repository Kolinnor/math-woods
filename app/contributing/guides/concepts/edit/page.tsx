import type { Route } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function EditConceptContributorGuidePage({
  searchParams
}: {
  searchParams?: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  const params = searchParams ? await searchParams : {};
  redirect(
    `/contributing/guides/concepts${params.saved ? `?saved=${encodeURIComponent(params.saved)}` : ""}` as Route
  );
}
