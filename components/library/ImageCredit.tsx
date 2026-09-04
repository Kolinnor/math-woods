import { Info } from "lucide-react";

export function ImageCredit({
  credit,
  creditUrl,
  license,
  label
}: {
  credit?: string | null;
  creditUrl?: string | null;
  license?: string | null;
  label: string;
}) {
  if (!credit && !license) return null;

  return (
    <details className="library-image-credit">
      <summary aria-label={label} title={label}><Info size={14} aria-hidden="true" /></summary>
      <p>
        {creditUrl && credit ? <a href={creditUrl} rel="noreferrer">{credit}</a> : credit}
        {credit && license ? " · " : null}
        {license}
      </p>
    </details>
  );
}
