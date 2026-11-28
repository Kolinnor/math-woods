/** Dispatched on window after a problem's solved, in-progress or liked state changes on the page. */
export const PROBLEM_STATE_CHANGED_EVENT = "mw:problem-state-changed";

export function announceProblemStateChange() {
  window.dispatchEvent(new Event(PROBLEM_STATE_CHANGED_EVENT));
}
