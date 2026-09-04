import { permanentRedirect } from "next/navigation";

export default async function LegacyMathematicianPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/library/mathematicians/${slug}`);
}
