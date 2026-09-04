import { permanentRedirect } from "next/navigation";

export default function LegacyProblemSourcesPage() {
  permanentRedirect("/library/references");
}
