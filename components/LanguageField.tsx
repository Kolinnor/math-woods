import { contentLanguageLabel, parseContentLanguage, SUPPORTED_CONTENT_LANGUAGES } from "@/lib/languages";

type LanguageFieldProps = {
  defaultValue?: string;
  help?: string;
  disabledValues?: readonly string[];
};

export function LanguageField({ defaultValue, help, disabledValues = [] }: LanguageFieldProps) {
  const language = parseContentLanguage(defaultValue);
  const disabledLanguages = new Set(disabledValues.map((value) => parseContentLanguage(value)));

  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">Language</span>
      <select name="language" defaultValue={language}>
        {SUPPORTED_CONTENT_LANGUAGES.map((option) => (
          <option key={option.code} value={option.code} disabled={disabledLanguages.has(option.code)}>
            {contentLanguageLabel(option.code)}
          </option>
        ))}
      </select>
      {help && <small className="muted">{help}</small>}
    </label>
  );
}
