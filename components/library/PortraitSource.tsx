"use client";

import { useId, useState } from "react";

function sourceLink(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function PortraitSource({ credit, creditUrl, license, details, locale }: {
  credit?: string | null; creditUrl?: string | null; license?: string | null; details?: string | null; locale: "fr" | "en";
}) {
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (details != null ? !details : !credit && !creditUrl && !license) return null;
  const label = locale === "fr" ? "Source du portrait" : "Portrait source";
  const href = sourceLink(creditUrl) ?? sourceLink(credit);
  const text = credit || creditUrl;
  const open = (hovered || focused || pinned) && !dismissed;
  return <div className="library-portrait-source"
    onMouseEnter={() => { setHovered(true); setDismissed(false); }}
    onMouseLeave={() => setHovered(false)}
    onFocus={() => { setFocused(true); setDismissed(false); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); setPinned(false); } }}
    onKeyDown={event => { if (event.key === "Escape") { setDismissed(true); setPinned(false); } }}>
    <button type="button" className="library-portrait-source-trigger" aria-label={label} aria-expanded={open} aria-controls={id}
      onClick={() => { setPinned(!pinned); setDismissed(pinned); }}>?</button>
    {open && <div id={id} className="library-portrait-source-content" role="region" aria-label={label}>
      {details != null ? <p className="library-portrait-details-text">{details.split(/(https?:\/\/[^\s<>]+)/g).map((part, index) => {
        const link = sourceLink(part);
        return link ? <a key={index} href={link} target="_blank" rel="noreferrer">{part}</a> : part;
      })}</p> : <>{text && <p>{href ? <a href={href} target="_blank" rel="noreferrer">{text}</a> : text}</p>}{license && <p>{license}</p>}</>}
    </div>}
  </div>;
}
