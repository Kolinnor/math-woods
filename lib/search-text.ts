/** Search equivalences only: never rewrite stored titles, slugs or Markdown. */
export function foldSearchText(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/ß/g, "ss");
}

export function searchPhrase(value: string) {
  return foldSearchText(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
