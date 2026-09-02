"use client";

import { useEffect, useRef } from "react";
import { markAnnouncementsSeenAction } from "@/lib/actions/announcement-actions";

export function AnnouncementSeenMarker() {
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    void markAnnouncementsSeenAction().catch(() => undefined);
  }, []);

  return null;
}
