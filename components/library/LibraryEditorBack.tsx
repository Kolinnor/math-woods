import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function LibraryEditorBack({ href, locale }: { href: string; locale: "fr" | "en" }) {
  return <Link className="library-editor-back" href={href as never}><ArrowLeft size={16} aria-hidden="true" />{locale === "fr" ? "Retour" : "Back"}</Link>;
}
