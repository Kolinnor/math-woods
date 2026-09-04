import { permanentRedirect } from "next/navigation";

export default function LegacyNewMathematicianPage() {
  permanentRedirect("/library/mathematicians/new");
}
