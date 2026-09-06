import { Parser } from "htmlparser2";

const PROTECTED_TAGS = new Set(["pre", "code", "kbd", "samp", "math", "svg", "annotation", "textarea", "input", "script", "style"]);
const APOSTROPHE = /(\p{L}\p{M}*)(?:'|&#0*39;|&#x0*27;|&apos;)(?=\p{L})/giu;
const URL_OR_EMAIL = /:\/\/|mailto:|www\.|@/i;

function proseApostrophes(text: string) {
  return text.replace(/\S+/gu, word => URL_OR_EMAIL.test(word) ? word : word.replace(APOSTROPHE, "$1’"));
}

// Only for already-sanitized display HTML. Keep tags, attributes, entities and
// protected subtrees byte-for-byte; never pass editor source or export data here.
// Applying this at display time also covers HTML saved before this feature.
export function displayTypography(html: string) {
  if (!/'|&#0*39;|&#x0*27;|&apos;/i.test(html)) return html;
  const protectedStack: boolean[] = [];
  let offset = 0;
  let result = "";
  const parser = new Parser({
    onopentag(name, attributes) {
      protectedStack.push(Boolean(protectedStack.at(-1)) || PROTECTED_TAGS.has(name)
        || /(?:^|\s)katex(?:-|\s|$)/.test(attributes.class ?? "")
        || "data-jsxgraph" in attributes
        || ("contenteditable" in attributes && attributes.contenteditable !== "false"));
    },
    onclosetag() { protectedStack.pop(); },
    ontext(text) {
      if (protectedStack.at(-1)) return;
      const converted = proseApostrophes(text);
      if (converted === text) return;
      result += html.slice(offset, parser.startIndex) + converted;
      offset = parser.endIndex + 1;
    }
  }, { decodeEntities: false });
  parser.end(html);
  return result + html.slice(offset);
}
