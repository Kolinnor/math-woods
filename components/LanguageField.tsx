import {
  ACTIVE_CONTENT_LANGUAGES,
  contentLanguageLabel,
  isActiveContentLanguage,
  parseActiveContentLanguage,
  parseContentLanguage
} from "@/lib/languages";

type LanguageFieldProps = {
  defaultValue?: string;
  help?: string;
  disabledValues?: readonly string[];
};

export function LanguageField({ defaultValue, disabledValues = [] }: LanguageFieldProps) {
  const knownDefaultLanguage = parseContentLanguage(defaultValue);
  const language = defaultValue ? knownDefaultLanguage : parseActiveContentLanguage(defaultValue);
  const disabledLanguages = new Set(disabledValues.map((value) => parseContentLanguage(value)));
  const options = isActiveContentLanguage(language)
    ? ACTIVE_CONTENT_LANGUAGES
    : [
        ...ACTIVE_CONTENT_LANGUAGES,
        { code: language, label: `${contentLanguageLabel(language)} (future)`, nativeLabel: language }
      ];

  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">Language</span>
      <select name="language" defaultValue={language}>
        {options.map((option) => (
          <option key={option.code} value={option.code} disabled={disabledLanguages.has(option.code)}>
            {contentLanguageLabel(option.code)}
          </option>
        ))}
      </select>
    </label>
  );
}
