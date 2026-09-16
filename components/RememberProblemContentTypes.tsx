"use client";

import { useEffect, useRef, type ReactNode, type FormEvent } from "react";
import { parseProblemContentTypes, type ProblemContentType } from "@/lib/problem-content-types";

function remember(cookieName: string, value: string) {
  document.cookie = `${cookieName}=${value}; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

export function RememberProblemContentTypes({ cookieName, selected, children }: {
  cookieName: string;
  selected: ProblemContentType[];
  children: ReactNode;
}) {
  const value = selected.join(".");
  const containerRef = useRef<HTMLDivElement>(null);
  // Also remember explicit URL filters, including links opened in a new tab.
  useEffect(() => {
    // An immediate click may precede this effect: read the live checkboxes so the
    // initial server values cannot overwrite the user's newer choice.
    const checked = Array.from(containerRef.current?.querySelectorAll<HTMLInputElement>('input[name="contentType"]:checked') ?? []);
    if (checked.length) remember(cookieName, parseProblemContentTypes(checked.map(input => input.value)).join("."));
  }, [cookieName, value]);

  function onChange(event: FormEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.name !== "contentType") return;
    const checked = Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input[name="contentType"]:checked'));
    // A list must include at least one type. Avoid silently restoring a different selection.
    if (!checked.length) {
      target.checked = true;
      return;
    }
    // Save synchronously, before the parent's debounced navigation or leaving the page.
    remember(cookieName, parseProblemContentTypes(checked.map(input => input.value)).join("."));
  }

  return <div ref={containerRef} key={value} className="problem-filter-section" onChange={onChange}>{children}</div>;
}
