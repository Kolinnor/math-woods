import Link from "next/link";

export default function NotFound() {
  return (
    <div className="error-page-shell mx-auto grid max-w-2xl gap-4">
      <section className="panel error-page-panel">
        <p className="error-page-kicker">404</p>
        <h1>You got lost in the forest.</h1>
        <p className="muted">
          This trail does not seem to lead to a Math Woods page. The map may have changed, or the path may never have
          existed.
        </p>
        <div className="error-page-actions">
          <Link href="/problems" className="button">
            Browse problems
          </Link>
          <Link href="/" className="button secondary">
            Back home
          </Link>
        </div>
      </section>
    </div>
  );
}
