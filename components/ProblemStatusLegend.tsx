export function ProblemStatusLegend() {
  return (
    <div className="problem-status-legend" aria-label="Problem status colors">
      <span>
        <i className="problem-status-swatch problem-status-new" />
        Not opened
      </span>
      <span>
        <i className="problem-status-swatch problem-status-seen" />
        Opened
      </span>
      <span>
        <i className="problem-status-swatch problem-status-solved" />
        Solved
      </span>
    </div>
  );
}
