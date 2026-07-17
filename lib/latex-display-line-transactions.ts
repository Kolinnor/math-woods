import { Annotation, EditorState, type StateEffectType } from "@codemirror/state";
import { normalizeDisplayMathLineBreaks } from "./latex-display-lines.ts";

export const skipDisplayMathLineBreakNormalization = Annotation.define<boolean>();

export function createDisplayMathLineBreakNormalizer(previewFocusEffect: StateEffectType<boolean>) {
  return EditorState.transactionFilter.of((transaction) => {
    if (transaction.annotation(skipDisplayMathLineBreakNormalization)) return transaction;
    if (!transaction.docChanged) return transaction;

    const nextText = transaction.newDoc.toString();
    const normalizedDisplayMath = normalizeDisplayMathLineBreaks(nextText, transaction.newSelection.main.anchor);
    if (!normalizedDisplayMath.changed) return transaction;

    return {
      changes: { from: 0, to: transaction.startState.doc.length, insert: normalizedDisplayMath.text },
      selection: { anchor: normalizedDisplayMath.cursor ?? normalizedDisplayMath.text.length },
      effects: previewFocusEffect.of(true)
    };
  });
}
