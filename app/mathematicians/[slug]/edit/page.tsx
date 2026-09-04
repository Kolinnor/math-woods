import { permanentRedirect } from "next/navigation";

export default async function LegacyEditMathematicianPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/library/mathematicians/${slug}/edit`);
}
