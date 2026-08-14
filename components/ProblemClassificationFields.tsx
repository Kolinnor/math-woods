import type { ProblemStyle } from "@prisma/client";

import { PROBLEM_STYLE_OPTIONS, problemStyleLabel } from "@/lib/problem-styles";

export function ProblemClassificationFields({
  initialStyles = [],
  initialIsConjecture = false,
  locale = "en"
}: {
  initialStyles?: readonly ProblemStyle[];
  initialIsConjecture?: boolean;
  locale?: string;
}) {
  const isFrench = locale.toLowerCase().startsWith("fr");

  return (
    <section className="problem-compose-subsection">
      <h2>{isFrench ? "Forme du problème" : "Problem style"}</h2>
      <div className="text-sm font-medium">{isFrench ? "Styles (facultatif)" : "Styles (optional)"}</div>
      <div className="problem-style-options">
        {PROBLEM_STYLE_OPTIONS.map((style) => (
          <label className="problem-style-option" key={style}>
            <input name="styles" type="checkbox" value={style} defaultChecked={initialStyles.includes(style)} />
            <span>{problemStyleLabel(style, locale)}</span>
          </label>
        ))}
      </div>
      <label className="checkbox-field problem-conjecture-field">
        <input name="isConjecture" type="checkbox" defaultChecked={initialIsConjecture} />
        <span>
          <strong>{isFrench ? "Conjecture ou problème ouvert" : "Conjecture or open problem"}</strong>
          <small>{isFrench ? "Aucune solution complète n'est actuellement connue." : "No complete solution is currently known."}</small>
        </span>
      </label>
    </section>
  );
}
