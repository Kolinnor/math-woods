import { permanentRedirect } from "next/navigation";

export default function LegacyMathematiciansPage() {
  permanentRedirect("/library/mathematicians");
}
