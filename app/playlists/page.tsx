import type { Route } from "next";
import { redirect } from "next/navigation";

export default function PlaylistsRedirectPage() {
  redirect("/explorations" as Route);
}
