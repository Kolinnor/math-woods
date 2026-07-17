import type { Route } from "next";
import { redirect } from "next/navigation";

export default function NewPlaylistRedirectPage() {
  redirect("/explorations/new" as Route);
}
