export const DEFAULT_CONTENT_LICENSE = "CC BY-SA 4.0";

export const CONTENT_LICENSES = [
  {
    value: "CC BY-SA 4.0",
    label: "CC BY-SA 4.0",
    description: "Credit is required; adaptations must remain under the same license."
  },
  {
    value: "CC BY 4.0",
    label: "CC BY 4.0",
    description: "Credit is required; adaptations may use another license."
  },
  {
    value: "CC0 1.0",
    label: "CC0 1.0",
    description: "The contributor waives copyright restrictions as far as legally possible."
  },
  {
    value: "Public domain",
    label: "Public domain",
    description: "Use only when the material is genuinely in the public domain."
  }
] as const;

export function parseContentLicense(value: FormDataEntryValue | string | null | undefined) {
  const input = String(value ?? "");
  return CONTENT_LICENSES.some((license) => license.value === input) ? input : DEFAULT_CONTENT_LICENSE;
}
