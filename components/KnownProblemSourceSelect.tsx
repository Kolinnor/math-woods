type KnownProblemSourceOption = {
  id: number;
  name: string;
  active: boolean;
};

export function KnownProblemSourceSelect({
  defaultValue,
  label,
  help,
  noneLabel,
  archivedLabel,
  sources
}: {
  defaultValue?: number | null;
  label: string;
  help: string;
  noneLabel: string;
  archivedLabel: string;
  sources: KnownProblemSourceOption[];
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <select name="knownSourceId" defaultValue={defaultValue ? String(defaultValue) : ""}>
        <option value="">{noneLabel}</option>
        {sources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.name}{source.active ? "" : ` (${archivedLabel})`}
          </option>
        ))}
      </select>
      <span className="muted text-sm">{help}</span>
    </label>
  );
}
