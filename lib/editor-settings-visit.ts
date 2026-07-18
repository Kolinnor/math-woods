export const EDITOR_SETTINGS_VISITED_STORAGE_KEY = "math-woods:editor-settings-visited";
export const EDITOR_SETTINGS_VISITED_EVENT = "math-woods:editor-settings-visited";

export function editorSettingsWereVisited() {
  try {
    return window.localStorage.getItem(EDITOR_SETTINGS_VISITED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function markEditorSettingsVisited() {
  try {
    window.localStorage.setItem(EDITOR_SETTINGS_VISITED_STORAGE_KEY, "true");
  } catch {
    // The account-backed preference still covers signed-in users when storage is blocked.
  }
  window.dispatchEvent(new Event(EDITOR_SETTINGS_VISITED_EVENT));
}
