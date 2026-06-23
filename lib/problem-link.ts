export type ProblemLinkState = "opened" | "solved" | null | undefined;

export function problemLinkClass(baseClass: string, state: boolean | ProblemLinkState = null) {
  const normalizedState = state === true ? "solved" : state === false ? null : state;
  const stateClass =
    normalizedState === "solved" ? " problem-solved" : normalizedState === "opened" ? " problem-opened" : "";

  return `${baseClass} problem-link${stateClass}`;
}
