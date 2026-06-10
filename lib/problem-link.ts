export function problemLinkClass(baseClass: string, solved = false) {
  return `${baseClass} problem-link${solved ? " problem-solved" : ""}`;
}
