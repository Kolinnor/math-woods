export const GUIDE_CALLOUT_DISMISSED_STORAGE_KEY = "math-woods:guide-callout-dismissed";

export function guideCalloutWasDismissed() {
  try {
    return window.localStorage.getItem(GUIDE_CALLOUT_DISMISSED_STORAGE_KEY) === "true";
  } catch {
    // Private browsing or blocked storage: show the callout rather than fail.
    return false;
  }
}

export function dismissGuideCallout() {
  try {
    window.localStorage.setItem(GUIDE_CALLOUT_DISMISSED_STORAGE_KEY, "true");
  } catch {
    // Nothing to persist to; the callout stays hidden for this page view only.
  }
}
