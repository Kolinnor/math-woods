"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { List, Waypoints } from "lucide-react";
import type { MouseEvent } from "react";
import {
  conceptBrowserViewCookie,
  conceptBrowserViewHref,
  type ConceptBrowserView
} from "@/lib/concept-browser-view";

const LIST_FILTERS_KEY = "math-woods:filters:concepts";

function savedListQuery() {
  try {
    return window.sessionStorage.getItem(LIST_FILTERS_KEY);
  } catch {
    return null;
  }
}

export function ConceptBrowserViewSwitch({
  view,
  labels
}: {
  view: ConceptBrowserView;
  labels: { group: string; map: string; list: string };
}) {
  const router = useRouter();

  function choose(event: MouseEvent<HTMLAnchorElement>, next: ConceptBrowserView) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    document.cookie = conceptBrowserViewCookie(next, window.location.protocol === "https:");
    if (next === "list") {
      event.preventDefault();
      router.push(conceptBrowserViewHref("list", savedListQuery()) as Route, { scroll: false });
    }
  }

  const options: { value: ConceptBrowserView; label: string; icon: typeof List }[] = [
    { value: "map", label: labels.map, icon: Waypoints },
    { value: "list", label: labels.list, icon: List }
  ];

  return (
    <nav className="concept-view-switch" aria-label={labels.group}>
      {options.map(({ value, label, icon: Icon }) => (
        <Link
          key={value}
          href={conceptBrowserViewHref(value) as Route}
          prefetch={false}
          scroll={false}
          aria-current={view === value ? "page" : undefined}
          onClick={(event) => choose(event, value)}
        >
          <Icon aria-hidden="true" size={16} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
