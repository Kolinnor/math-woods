import { contentLanguageLabel, parseContentLanguage, SUPPORTED_CONTENT_LANGUAGES } from "@/lib/languages";

type LanguageFieldProps = {
  defaultValue?: string;
  help?: string;
};

export function LanguageField({ defaultValue, help }: LanguageFieldProps) {
  const language = parseContentLanguage(defaultValue);

  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">Language</span>
      <select name="language" defaultValue={language}>
        {SUPPORTED_CONTENT_LANGUAGES.map((option) => (
          <option key={option.code} value={option.code}>
            {contentLanguageLabel(option.code)}
          </option>
        ))}
      </select>
      {help && <small className="muted">{help}</small>}
    </label>
  );
}
