"use client";

import { useState } from "react";
import { announcementPollCopy, POLL_LIMITS } from "@/lib/announcement-polls";

export function AnnouncementPollFields({ locale }: { locale: "fr" | "en" }) {
  const [enabled, setEnabled] = useState(false);
  const copy = announcementPollCopy[locale];
  return <div className="announcement-poll-fields">
    <label className="announcement-poll-toggle">
      <input type="checkbox" name="includePoll" checked={enabled} onChange={event => setEnabled(event.target.checked)} />
      <span>{copy.add}</span>
    </label>
    <div hidden={!enabled} className="announcement-poll-settings">
      <label className="grid gap-1.5 font-medium">
        {copy.question}
        <input name="pollQuestion" required={enabled} disabled={!enabled} maxLength={POLL_LIMITS.question} />
      </label>
      <label className="grid gap-1.5 font-medium">
        {copy.options}
        <textarea name="pollOptions" rows={4} required={enabled} disabled={!enabled} maxLength={2000} aria-describedby="poll-options-help" />
      </label>
      <p id="poll-options-help" className="muted text-xs">{copy.optionsHelp}</p>
      <p className="muted text-xs">{copy.rules}</p>
    </div>
  </div>;
}
