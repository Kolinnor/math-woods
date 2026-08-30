import type { CSSProperties, ReactNode } from "react";
import {
  PROBLEM_DIFFICULTY_BANDS,
  problemDifficultyBand,
  problemDifficultyBars,
  problemDifficultyTone
} from "@/lib/problem-difficulty";

function LocalizedText({ en, fr }: { en: ReactNode; fr: ReactNode }) {
  return (
    <>
      <span className="mw-locale-en">{en}</span>
      <span className="mw-locale-fr">{fr}</span>
    </>
  );
}

function DifficultyMark({ compact, showBand, value }: { compact: boolean; showBand: boolean; value: number | null }) {
  const level = problemDifficultyBars(value);
  const tone = problemDifficultyTone(value);
  const band = problemDifficultyBand(value);

  return (
    <span className={compact ? "mw-difficulty mw-difficulty-compact" : "mw-difficulty"}>
      <strong style={{ color: tone }}>{value ?? "--"}</strong>
      <span className="mw-difficulty-bars" aria-hidden="true">
        {[1, 2, 3, 4, 5, 6].map((bar) => (
          <i key={bar} style={bar <= level ? { backgroundColor: tone } : undefined} />
        ))}
      </span>
      {showBand && band && (
        <small className="mw-difficulty-label">
          <LocalizedText en={band.shortEn} fr={band.shortFr} />
        </small>
      )}
    </span>
  );
}

function DifficultyPopover({ value }: { value: number | null }) {
  return (
    <div className="mw-difficulty-popover">
      <strong><LocalizedText en="Difficulty scale" fr="Échelle de difficulté" /></strong>
      <p>
        <LocalizedText
          en="This score reflects both the level of the required concepts and the difficulty of the solution."
          fr="Ce score tient compte à la fois du niveau des notions nécessaires et de la difficulté de la résolution."
        />
      </p>
      <div className="mw-difficulty-scale-track" aria-hidden="true"><i /></div>
      <ol>
        {PROBLEM_DIFFICULTY_BANDS.map((band) => (
          <li key={band.min} className={value !== null && value >= band.min && value <= band.max ? "is-current" : undefined}>
            <b>{band.min}–{band.max}</b>
            <span><LocalizedText en={band.detailEn} fr={band.detailFr} /></span>
          </li>
        ))}
      </ol>
      <small>
        <LocalizedText
          en="These levels are approximate guides."
          fr="Ces niveaux sont des repères approximatifs."
        />
      </small>
    </div>
  );
}

export function DifficultyBandHelp({ value }: { value: number | null }) {
  const band = problemDifficultyBand(value);
  if (!band) return null;
  const tone = problemDifficultyTone(value);
  const position = Math.min(100, Math.max(1, value ?? 1));

  return (
    <span
      className="mw-difficulty-band-help mw-difficulty-hover-explainer"
      style={{ "--difficulty-position": `${position}%`, "--difficulty-tone": tone } as CSSProperties}
      tabIndex={0}
    >
      <span className="mw-difficulty-label"><LocalizedText en={band.shortEn} fr={band.shortFr} /></span>
      <DifficultyPopover value={value} />
    </span>
  );
}

export function Difficulty({
  compact = false,
  explain = false,
  showBand = false,
  value
}: {
  compact?: boolean;
  explain?: boolean;
  showBand?: boolean;
  value: number | null;
}) {
  const tone = problemDifficultyTone(value);
  const band = problemDifficultyBand(value);
  const position = value === null ? 0 : Math.min(100, Math.max(1, value));
  const accessibleLabel = value === null ? "Difficulty not rated" : `Difficulty ${value} out of 100`;

  if (!explain) {
    return (
      <span
        className={`mw-difficulty-shell${showBand && band ? " mw-difficulty-hover-explainer" : ""}`}
        aria-label={accessibleLabel}
        style={{ "--difficulty-position": `${position}%`, "--difficulty-tone": tone } as CSSProperties}
      >
        <DifficultyMark compact={compact} showBand={showBand} value={value} />
        {showBand && band && <DifficultyPopover value={value} />}
      </span>
    );
  }
  return (
    <details className="mw-difficulty-explainer" style={{ "--difficulty-position": `${position}%`, "--difficulty-tone": tone } as CSSProperties}>
      <summary aria-label={accessibleLabel}>
        <DifficultyMark compact={compact} showBand={showBand} value={value} />
      </summary>
      <DifficultyPopover value={value} />
    </details>
  );
}
