"use client";

export function ExplorationBlockKindSelect({
  formId,
  initialKind,
  kinds
}: {
  formId: string;
  initialKind: string;
  kinds: Array<{ label: string; value: string }>;
}) {
  return (
    <select
      className="studio-block-kind-select"
      defaultValue={initialKind}
      form={formId}
      name="kind"
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    >
      {kinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
    </select>
  );
}
