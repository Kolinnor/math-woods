"use client";

import { useEffect } from "react";
import { markEditorSettingsVisited } from "@/lib/editor-settings-visit";

export function EditorSettingsVisitedMarker() {
  useEffect(() => {
    markEditorSettingsVisited();
    void fetch("/api/editor-preferences", {
      method: "POST",
      keepalive: true
    }).catch(() => {
      // The local marker still hides the onboarding hint if persistence fails.
    });
  }, []);

  return null;
}
