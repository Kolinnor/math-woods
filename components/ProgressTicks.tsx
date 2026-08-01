export function ProgressTicks({ done, total }: { done: number; total: number }) {
  const tickCount = Math.max(1, Math.min(24, total));
  const filled = total > 0 ? Math.round((done / total) * tickCount) : 0;

  return (
    <span className="mw-progress-ticks" aria-label={`${done} of ${total} solved`}>
      {Array.from({ length: tickCount }, (_, index) => (
        <i key={index} className={index < filled ? "filled" : undefined} />
      ))}
    </span>
  );
}
