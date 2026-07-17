type FieldHelpProps = {
  text: string;
};

export function FieldHelp({ text }: FieldHelpProps) {
  return (
    <span className="field-help" tabIndex={0} title={text} aria-label={text}>
      ?
    </span>
  );
}
