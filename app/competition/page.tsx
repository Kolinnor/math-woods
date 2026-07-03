import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";

export default function CompetitionPage() {
  return (
    <ForestPageLayout
      title="Competition"
      eyebrow="Work in progress"
      heroImage="/art/pine-forest.jpg"
      heroAlt="Ivan Shishkin, Pine Forest"
      description="A future place for time-boxed problem sets and community events."
    >
      <p className="panel p-5">
        For now, the problems library is the best place to practice.
      </p>
      <Link href="/problems" className="button mt-6">
        Browse problems
      </Link>
    </ForestPageLayout>
  );
}
