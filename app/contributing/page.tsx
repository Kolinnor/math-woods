import Link from "next/link";

export default function ContributingPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold">Contribution guidelines</h1>
      <p className="muted mt-2">
        Math Woods should feel like an old map being filled in: rough paths, missing clearings, margin notes, better routes.
      </p>

      <div className="mt-8 grid gap-7">
        <section className="growth-note">
          <strong>Do not wait for perfection.</strong>
          <span>
            A clean problem, a stub concept, a source note, a partial solution, or a correction request can already help.
          </span>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Make rough work visible</h2>
          <p className="mt-2">
            Mark unfinished material honestly. Use <strong>Needs work</strong>, stub statuses, talk pages, edit
            summaries, and reports. A rough page with clear uncertainty is useful.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Keep barriers low</h2>
          <p className="mt-2">
            Beginners should be able to add examples, ask for clarification, report copied wording, propose a better
            hint, or create a missing concept.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Write for verification</h2>
          <p className="mt-2">
            Cite reliable textbooks, papers, lecture notes, or established reference works when a claim needs support.
            If the source is uncertain, say so. Uncertainty is useful when it is visible.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Prefer clarity over completeness</h2>
          <p className="mt-2">
            A useful first version can be short. Add definitions, examples, counterexamples, solutions, and links when
            they are ready.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Make edits accountable</h2>
          <p className="mt-2">
            Use concise edit summaries. For disputed scope, terminology, or sources, discuss the change on the talk
            page before repeatedly rewriting it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Use reports without making them scary</h2>
          <p className="mt-2">
            Reports are not only for emergencies. They can flag copied wording, questionable origins, wrong statements,
            spoilers, or pages that need attention.
          </p>
        </section>
      </div>

      <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-6">
        <Link href="/concepts/new" className="button secondary">
          Add a concept
        </Link>
        <Link href="/problems?quality=NEEDS_WORK" className="button secondary">
          Improve problems
        </Link>
        <Link href="/recent-changes" className="button secondary">
          Recent changes
        </Link>
      </div>
    </article>
  );
}
