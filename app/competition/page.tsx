import Link from "next/link";

export default function CompetitionPage() {
  return (
    <div className="mx-auto max-w-3xl py-12">
      <p className="muted mb-2 text-sm uppercase">Work in progress</p>
      <h1 className="text-3xl font-bold">Competition</h1>
      <p className="muted mt-3 max-w-2xl">
        A future place for time-boxed problem sets and community events. For now, the problems library is the best
        place to practice.
      </p>
      <Link href="/problems" className="button mt-6">
        Browse problems
      </Link>
    </div>
  );
}
