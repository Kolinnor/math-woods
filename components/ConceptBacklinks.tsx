import { Children, type ReactNode } from "react";

const VISIBLE_BACKLINKS = 6;

export function ConceptBacklinks({ children, labels }: {
  children: ReactNode;
  labels: { title: string; showMore: (count: number) => string; showLess: string };
}) {
  // Flatten both source lists so the limit applies to problems and concepts together.
  const links = Children.toArray(children);
  if (!links.length) return null;
  const remaining = links.slice(VISIBLE_BACKLINKS);
  return <section className="concept-rail-section">
    <h2 className="mb-3 font-semibold">{labels.title}</h2>
    <div className="grid gap-2 text-sm">
      {links.slice(0, VISIBLE_BACKLINKS)}
      {remaining.length > 0 && <details className="concept-backlinks-more">
        <summary>
          <span className="concept-backlinks-show-more">{labels.showMore(remaining.length)}</span>
          <span className="concept-backlinks-show-less">{labels.showLess}</span>
        </summary>
        <div className="grid gap-2 mt-2">{remaining}</div>
      </details>}
    </div>
  </section>;
}
