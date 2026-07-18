import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

export function ExplorationHelpTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="exploration-help-tooltip-trigger" tabIndex={0} aria-label={label}>
      <CircleHelp size={15} strokeWidth={2.2} aria-hidden="true" />
      <span className="exploration-help-tooltip" role="tooltip">{children}</span>
    </span>
  );
}
