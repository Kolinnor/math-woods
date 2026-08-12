export const TRANSLATED_HINT_BODY_PREFIX = "translatedHintBody:";
export const TRANSLATED_PROOF_BODY_PREFIX = "translatedProofBody:";
export const TRANSLATED_PROOF_HINT_BODY_PREFIX = "translatedProofHintBody:";

export function parseSelectedTranslationIds(values: FormDataEntryValue[]) {
  return [...new Set(values.map(Number).filter((value) => Number.isInteger(value) && value > 0))];
}

export function translationBodyFieldName(prefix: string, sourceId: number) {
  return `${prefix}${sourceId}`;
}
