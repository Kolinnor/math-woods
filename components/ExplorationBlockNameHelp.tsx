import { CircleHelp } from "lucide-react";

export function ExplorationBlockNameHelp() {
  return (
    <span className="exploration-block-name-help" tabIndex={0} aria-label="About block names">
      <CircleHelp size={15} strokeWidth={2.2} aria-hidden="true" />
      <span className="exploration-block-name-tooltip" role="tooltip">
        This name is only visible in the studio. It helps you identify the block on the map and is never shown to readers.
      </span>
    </span>
  );
}
