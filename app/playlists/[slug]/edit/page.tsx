import type { Route } from "next";
import { redirect } from "next/navigation";

export default async function EditPlaylistRedirectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/explorations/${slug}/edit` as Route);
}
