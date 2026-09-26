"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChevronDown, Maximize2, Minimize2, Minus, Plus, Scan, Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import type { ConceptMapRenderer, ConceptMapRendererData } from "@/components/concept-map-renderer";
import { conceptMapDataHref } from "@/lib/concept-browser-view";
import type { ConceptMapDomain, ConceptMapPayload, ConceptMapTierInfo } from "@/lib/concept-map";
import { normalizeConceptMapSearch } from "@/lib/concept-map-text";
import { contentLanguageViewHref } from "@/lib/translation-routing";

export type ConceptMapCopy = Record<string, string>;

type ConceptMapResponsePayload = ConceptMapPayload & { titleHtml?: Record<string, string> };

/** The tiers loaded so far, merged and indexed by global node index. */
type ConceptMapData = Omit<ConceptMapRendererData, "domains"> & {
  version: string;
  total: { nodes: number; links: number };
  tiers: ConceptMapTierInfo[];
  loadedTiers: number;
  maxLevel: number;
  domains: ConceptMapDomain[];
  slug: string[];
  kind: number[];
  title: Record<string, string>;
  terms: Record<string, string>;
  titleHtml: Record<string, string>;
  links: number[];
};

type Status = "loading" | "ready" | "error" | "unsupported";

const STATUSES = ["STUB", "USABLE", "REVIEWED", "EXCELLENT", "CONTROVERSIAL", "MISSING"];
const KINDS = ["DEFINITION", "THEOREM", "INTUITIVE_NOTION", "NOTATION"];
const CAMERA_KEY = "math-woods:concept-map:camera";
const MAX_RESULTS = 8;
const COMPACT_QUERY = "(max-width: 900px)";

function format(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/** Thrown when the renderer cannot get a WebGL context. */
class WebGLUnavailableError extends Error {}

function readCamera(version: string) {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(CAMERA_KEY) ?? "null") as
      | { version?: string; x: number; y: number; ratio: number }
      | null;
    return saved?.version === version && [saved.x, saved.y, saved.ratio].every(Number.isFinite) ? saved : null;
  } catch {
    return null;
  }
}

function writeCamera(version: string, camera: { x: number; y: number; ratio: number }) {
  try {
    window.sessionStorage.setItem(CAMERA_KEY, JSON.stringify({ version, ...camera }));
  } catch {
    // Storage can be refused (private windows); the map then opens fully zoomed out.
  }
}

function conceptFromHash() {
  const match = /(?:^#|&)concept=([^&]+)/.exec(window.location.hash);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function replaceHash(slug: string | null) {
  const { pathname, search, hash } = window.location;
  const nextHash = slug ? `#concept=${encodeURIComponent(slug)}` : "";
  if (hash === nextHash || (!slug && !hash.startsWith("#concept="))) return;
  window.history.replaceState(window.history.state, "", `${pathname}${search}${nextHash}`);
}

async function fetchTier(language: string, tier: number, options: { signal?: AbortSignal; revalidate?: boolean } = {}) {
  // No custom header: the request must match the one preloaded by the page.
  const response = await fetch(conceptMapDataHref(language, tier), {
    signal: options.signal,
    cache: options.revalidate ? "no-cache" : "default"
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as ConceptMapResponsePayload;
}

function mergeTier(previous: ConceptMapData | null, payload: ConceptMapResponsePayload): ConceptMapData {
  const nodes = payload.nodes;
  if (!previous) {
    return {
      version: payload.version,
      total: payload.total,
      tiers: payload.tiers,
      loadedTiers: 1,
      maxLevel: payload.maxLevel,
      bounds: payload.bounds,
      domains: payload.domains,
      slug: nodes.slug,
      label: nodes.label,
      x: nodes.x,
      y: nodes.y,
      domain: nodes.domain,
      status: nodes.status,
      kind: nodes.kind,
      degree: nodes.degree,
      level: nodes.level,
      title: nodes.title,
      terms: nodes.terms,
      titleHtml: payload.titleHtml ?? {},
      links: payload.links
    };
  }
  return {
    ...previous,
    loadedTiers: previous.loadedTiers + 1,
    slug: previous.slug.concat(nodes.slug),
    label: previous.label.concat(nodes.label),
    x: previous.x.concat(nodes.x),
    y: previous.y.concat(nodes.y),
    domain: previous.domain.concat(nodes.domain),
    status: previous.status.concat(nodes.status),
    kind: previous.kind.concat(nodes.kind),
    degree: previous.degree.concat(nodes.degree),
    level: previous.level.concat(nodes.level),
    title: { ...previous.title, ...nodes.title },
    terms: { ...previous.terms, ...nodes.terms },
    titleHtml: { ...previous.titleHtml, ...(payload.titleHtml ?? {}) },
    links: previous.links.concat(payload.links)
  };
}

export function ConceptMap({
  language,
  copy,
  domainLabels,
  kindLabels,
  statusLabels,
  listHref
}: {
  language: string;
  copy: ConceptMapCopy;
  domainLabels: Record<string, string>;
  kindLabels: Record<string, string>;
  statusLabels: Record<string, string>;
  listHref: string;
}) {
  const router = useRouter();
  const ids = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ConceptMapRenderer | null>(null);
  const dataRef = useRef<ConceptMapData | null>(null);
  /** Tiers requested so far (loaded or on their way), and the promise of the last one. */
  const tierChainRef = useRef<{ scheduled: number; promise: Promise<void> } | null>(null);
  const revalidateRef = useRef(false);
  /** Incremented each time the map is (re)loaded: late answers of an earlier load are ignored. */
  const generationRef = useRef(0);
  const [data, setData] = useState<ConceptMapData | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [highlightQuery, setHighlightQuery] = useState("");
  const [activeResult, setActiveResult] = useState(0);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [hiddenDomains, setHiddenDomains] = useState<ReadonlySet<number>>(() => new Set());
  const [compact, setCompact] = useState(false);
  const [domainsOpen, setDomainsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  // Read before any selection rewrites the hash (links shared as /concepts#concept=slug).
  const initialSlugRef = useRef<string | null | undefined>(undefined);
  if (initialSlugRef.current === undefined && typeof window !== "undefined") initialSlugRef.current = conceptFromHash();
  const compactRef = useRef(false);
  compactRef.current = compact;
  const domainLabelsRef = useRef(domainLabels);
  domainLabelsRef.current = domainLabels;
  // On small screens the selection opens as a bottom sheet over the map: keep the concept above it.
  const bottomInset = () => (compactRef.current ? (stageRef.current?.clientHeight ?? 0) * 0.5 : 0);

  const select = useCallback((index: number | null, options: { focus?: boolean; zoom?: boolean } = {}) => {
    setSelected(index);
    if (index !== null && options.focus) rendererRef.current?.focus(index, { zoom: options.zoom, bottomInset: bottomInset() });
  }, []);

  const applyInitialSelection = useCallback((merged: ConceptMapData) => {
    const slug = initialSlugRef.current;
    if (!slug) return;
    const index = merged.slug.indexOf(slug);
    if (index < 0) return;
    initialSlugRef.current = null;
    setSelected(index);
    if (!readCamera(merged.version)) rendererRef.current?.focus(index, { bottomInset: bottomInset() });
  }, []);

  /**
   * Loads, in order, every tier holding concepts of a level up to `level`: when the camera gets
   * close to a level, on idle on large screens, or everything for a search or a selection.
   */
  const loadThrough = useCallback(
    (level: number) => {
      const current = dataRef.current;
      if (!current) return Promise.resolve();
      let chain = tierChainRef.current ?? { scheduled: current.loadedTiers, promise: Promise.resolve() };
      const started = chain;
      while (chain.scheduled < current.tiers.length && current.tiers[chain.scheduled - 1].level < level) {
        const tier = chain.scheduled + 1;
        const generation = generationRef.current;
        chain = {
          scheduled: tier,
          promise: chain.promise.then(async () => {
            const payload = await fetchTier(language, tier);
            const previous = dataRef.current;
            if (!previous || generation !== generationRef.current) throw new Error("map reloaded");
            if (payload.version !== previous.version || payload.offset !== previous.slug.length) {
              // The map changed on the server since the first tier (or the browser kept an old
              // copy of it): start again from a fresh first tier.
              revalidateRef.current = true;
              setAttempt((value) => value + 1);
              throw new Error("stale tier");
            }
            const merged = mergeTier(previous, payload);
            dataRef.current = merged;
            rendererRef.current?.addNodes(merged, previous.slug.length, payload.links);
            setData(merged);
            applyInitialSelection(merged);
          })
        };
      }
      if (chain !== started) {
        const scheduled = chain;
        tierChainRef.current = scheduled;
        // After a failure, the next call starts again from the tiers actually loaded.
        scheduled.promise.catch(() => {
          if (tierChainRef.current === scheduled) tierChainRef.current = null;
        });
      }
      return chain.promise.catch(() => undefined);
    },
    [applyInitialSelection, language]
  );
  const loadEverything = useCallback(() => loadThrough(Infinity), [loadThrough]);

  // The map is drawn at once; its data and the WebGL code load in parallel. The page asks the
  // browser to preload the first tier, so the request is usually already done.
  useEffect(() => {
    // Creating a WebGL context only to test it costs as much as the map's own: let the renderer try.
    if (typeof window.WebGLRenderingContext === "undefined") {
      setStatus("unsupported");
      return;
    }
    const controller = new AbortController();
    const container = stageRef.current!;
    let renderer: ConceptMapRenderer | null = null;
    let cancelled = false;
    setStatus("loading");
    generationRef.current += 1;
    dataRef.current = null;
    tierChainRef.current = null;
    setData(null);
    performance.mark?.("concept-map:start");
    const createRenderer = (createConceptMapRenderer: typeof import("@/components/concept-map-renderer").createConceptMapRenderer) =>
      createConceptMapRenderer(
        container,
        {
          onSelect: (index) => {
            setSelected(index);
            if (index !== null && compactRef.current) renderer?.focus(index, { zoom: false, bottomInset: bottomInset() });
          },
          onOpen: (index) => {
            const current = dataRef.current;
            if (current) router.push(contentLanguageViewHref("/concepts", current.slug[index], language) as Route);
          },
          // Hover is purely visual: no React render on every pointer move.
          onHover: (index) => renderer?.update({ hovered: index }),
          // One zoom step ahead of the camera, so that zooming in finds its concepts already there.
          onLevel: (level) => void loadThrough(level)
        },
        {
          reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          fontFamily: getComputedStyle(document.body).fontFamily,
          serifFamily: getComputedStyle(document.documentElement).getPropertyValue("--font-serif").trim(),
          domainName: (index) => {
            const code = dataRef.current?.domains[index]?.code;
            return code ? domainLabelsRef.current[code] ?? code : undefined;
          },
          reservedAreas: () => {
            const origin = container.getBoundingClientRect();
            return [...(container.closest(".concept-map-frame")?.querySelectorAll(".concept-map-search, .concept-map-controls, .concept-map-help, .concept-map-selection") ?? [])].filter(element => element.getClientRects().length > 0).map((element) => {
              const box = element.getBoundingClientRect();
              return { left: box.left - origin.left, top: box.top - origin.top, right: box.right - origin.left, bottom: box.bottom - origin.top };
            });
          }
        }
      );
    const rendererPromise = import("@/components/concept-map-renderer").then(({ createConceptMapRenderer }) => {
      if (cancelled) return null;
      try {
        renderer = createRenderer(createConceptMapRenderer);
      } catch {
        container.replaceChildren();
        throw new WebGLUnavailableError();
      }
      rendererRef.current = renderer;
      return renderer;
    });
    const dataPromise = fetchTier(language, 1, { signal: controller.signal, revalidate: revalidateRef.current });
    revalidateRef.current = false;
    rendererPromise.then(
      (created) => {
        if (created && !cancelled) setStatus((current) => (current === "loading" ? "ready" : current));
      },
      (error: unknown) => {
        if (!cancelled) setStatus(error instanceof WebGLUnavailableError ? "unsupported" : "error");
      }
    );
    Promise.all([rendererPromise, dataPromise])
      .then(([created, payload]) => {
        if (!created || cancelled) return;
        performance.measure?.("concept-map:first-tier", "concept-map:start");
        const merged = mergeTier(null, payload);
        dataRef.current = merged;
        created.addNodes(merged, 0, payload.links);
        const camera = readCamera(merged.version);
        if (camera) created.setCamera(camera);
        setData(merged);
        applyInitialSelection(merged);
        // A shared #concept= link to a concept of a later tier.
        if (initialSlugRef.current) void loadThrough(Infinity);
        container.dataset.ready = "true";
        if (!compactRef.current) {
          // Large screens get the rest of the map while idle, one tier (one level) at a time.
          const idle = (callback: () => void) => {
            const request = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
            if (request) request(callback, { timeout: 2000 });
            else window.setTimeout(callback, 800);
          };
          const prefetch = () => {
            const current = dataRef.current;
            if (cancelled || !current) return;
            const next = tierChainRef.current?.scheduled ?? current.loadedTiers;
            if (next >= current.tiers.length) return;
            const loaded = current.loadedTiers;
            void loadThrough(current.tiers[next].level).then(() => {
              // Stops on a failure: a search, a selection or the zoom will try again.
              if ((dataRef.current?.loadedTiers ?? 0) > loaded) idle(prefetch);
            });
          };
          idle(prefetch);
        }
      })
      .catch((error: unknown) => {
        if (cancelled || (error as { name?: string } | null)?.name === "AbortError") return;
        setStatus((current) => (current === "unsupported" ? current : "error"));
      });
    return () => {
      cancelled = true;
      controller.abort();
      if (renderer) {
        if (dataRef.current) writeCamera(dataRef.current.version, renderer.getCamera());
        renderer.destroy();
      }
      rendererRef.current = null;
      delete container.dataset.ready;
    };
  }, [language, attempt, router, loadThrough, applyInitialSelection]);

  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    setCanFullscreen(Boolean(document.fullscreenEnabled));
    return () => media.removeEventListener("change", update);
  }, []);

  // Neighbors of the selected concept only: one pass over the links, instead of adjacency lists
  // for tens of thousands of concepts.
  const neighbors = useMemo(() => {
    if (!data || selected === null) return null;
    const cites: number[] = [];
    const citedBy: number[] = [];
    for (let index = 0; index < data.links.length; index += 2) {
      if (data.links[index] === selected) cites.push(data.links[index + 1]);
      else if (data.links[index + 1] === selected) citedBy.push(data.links[index]);
    }
    const byImportance = (left: number, right: number) =>
      data.degree[right] - data.degree[left] || data.label[left].localeCompare(data.label[right]);
    return { cites: cites.sort(byImportance), citedBy: citedBy.sort(byImportance) };
  }, [data, selected]);

  // Normalized labels, prepared on the first search only.
  const searchableRef = useRef<{ data: ConceptMapData; items: { label: string; terms: string[] }[] } | null>(null);
  const searchableFor = useCallback((current: ConceptMapData) => {
    const cached = searchableRef.current;
    const from = cached?.data === current ? current.slug.length : cached && cached.data.version === current.version ? cached.items.length : 0;
    const items = from > 0 && cached ? cached.items : [];
    for (let index = from; index < current.slug.length; index += 1) {
      items.push({ label: normalizeConceptMapSearch(current.label[index]), terms: current.terms[index] ? current.terms[index].split("\n") : [] });
    }
    searchableRef.current = { data: current, items };
    return items;
  }, []);

  const rankMatches = useCallback(
    (rawQuery: string) => {
      const normalizedQuery = normalizeConceptMapSearch(rawQuery);
      if (!data || normalizedQuery.length === 0) return null;
      const ranked: { index: number; score: number }[] = [];
      searchableFor(data).forEach(({ label, terms }, index) => {
        if (hiddenDomains.has(data.domain[index])) return;
        let score = -1;
        if (label === normalizedQuery) score = 0;
        else if (label.startsWith(normalizedQuery)) score = 1;
        else if (label.includes(` ${normalizedQuery}`)) score = 2;
        else if (terms.some((term) => term === normalizedQuery || term.startsWith(normalizedQuery))) score = 3;
        else if (label.includes(normalizedQuery)) score = 4;
        else if (terms.some((term) => term.includes(normalizedQuery))) score = 5;
        if (score >= 0) ranked.push({ index, score });
      });
      ranked.sort((left, right) => left.score - right.score || data.degree[right.index] - data.degree[left.index]);
      return {
        matches: new Set(ranked.map(({ index }) => index)) as ReadonlySet<number>,
        results: ranked.slice(0, MAX_RESULTS).map(({ index }) => index)
      };
    },
    [data, searchableFor, hiddenDomains]
  );
  const search = useMemo(() => rankMatches(query), [rankMatches, query]);
  // On large maps the highlight follows the typing with a short delay: it recomputes every dot.
  const highlight = useMemo(
    () => (highlightQuery === query ? search : rankMatches(highlightQuery)),
    [highlightQuery, query, search, rankMatches]
  );
  useEffect(() => {
    const timer = window.setTimeout(() => setHighlightQuery(query), (data?.slug.length ?? 0) > 5000 ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [query, data]);

  const conceptHref = useCallback((index: number) => contentLanguageViewHref("/concepts", data!.slug[index], language), [data, language]);

  useEffect(() => {
    rendererRef.current?.update({ selected, matches: highlight?.matches ?? null, hiddenDomains });
  }, [selected, highlight, hiddenDomains]);

  useEffect(() => {
    if (!data) return;
    replaceHash(selected === null ? null : data.slug[selected]);
    setAnnouncement(
      selected === null
        ? ""
        : format(copy.announceSelection, { title: data.label[selected], cites: neighbors?.cites.length ?? 0, citedBy: neighbors?.citedBy.length ?? 0 })
    );
    // A selection lists every neighbor: make sure the less important concepts are loaded.
    if (selected !== null) void loadEverything();
  }, [selected, data, neighbors, copy.announceSelection, loadEverything]);

  useEffect(() => {
    if (!data) return;
    // A #concept= link opened from the same tab selects that concept.
    const onHashChange = () => {
      const slug = conceptFromHash();
      const index = slug ? data.slug.indexOf(slug) : -1;
      if (index >= 0) select(index, { focus: true });
      else if (slug) {
        initialSlugRef.current = slug;
        void loadEverything();
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [data, select, loadEverything]);

  useEffect(() => {
    // Keep the camera when leaving for a concept page, so that "Back" finds the same view.
    const save = () => {
      if (dataRef.current && rendererRef.current) writeCamera(dataRef.current.version, rendererRef.current.getCamera());
    };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, []);

  useEffect(() => {
    const onChange = () => {
      setFullscreen(document.fullscreenElement === frameRef.current);
      window.requestAnimationFrame(() => rendererRef.current?.resize());
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (selected !== null && data && hiddenDomains.has(data.domain[selected])) setSelected(null);
  }, [hiddenDomains, selected, data]);

  function toggleFullscreen() {
    const frame = frameRef.current;
    if (!frame) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frame.requestFullscreen?.();
  }

  function onStageKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const renderer = rendererRef.current;
    if (!renderer || event.altKey || event.ctrlKey || event.metaKey) return;
    const step = 0.12;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => renderer.pan(-step, 0),
      ArrowRight: () => renderer.pan(step, 0),
      ArrowUp: () => renderer.pan(0, -step),
      ArrowDown: () => renderer.pan(0, step),
      "+": () => renderer.zoomIn(),
      "=": () => renderer.zoomIn(),
      "-": () => renderer.zoomOut(),
      "0": () => renderer.reset(),
      Escape: () => select(null),
      Enter: () => {
        if (selected !== null) router.push(conceptHref(selected) as Route);
      }
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  function chooseResult(index: number) {
    setResultsOpen(false);
    select(index, { focus: true });
  }

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    const results = search?.results ?? [];
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && results.length) {
      event.preventDefault();
      setResultsOpen(true);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveResult((current) => (current + delta + results.length) % results.length);
    } else if (event.key === "Enter" && results.length) {
      event.preventDefault();
      chooseResult(results[Math.min(activeResult, results.length - 1)]);
    } else if (event.key === "Escape") {
      if (resultsOpen && query) setResultsOpen(false);
      else setQuery("");
    }
  }

  function toggleDomain(index: number) {
    setHiddenDomains((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const domainLabel = (index: number) => {
    const code = data!.domains[index].code;
    return domainLabels[code] ?? code;
  };
  const visibleCount = data ? data.domains.reduce((sum, domain, index) => sum + (hiddenDomains.has(index) ? 0 : domain.count), 0) : 0;
  const selectedTitleHtml = data && selected !== null ? data.titleHtml[String(selected)] : undefined;
  const resultsId = `${ids}-results`;
  const helpId = `${ids}-help`;
  const domainListId = `${ids}-domains`;
  const showResults = resultsOpen && search !== null;
  const activeIndex = search && search.results.length ? Math.min(activeResult, search.results.length - 1) : -1;
  const summary = data ? format(copy.summary, { concepts: data.total.nodes, links: data.total.links }) : "";

  const neighborList = (title: string, items: number[]) => (
    <div className="concept-map-neighbors">
      <h3>
        {title} <span>{items.length}</span>
      </h3>
      {items.length ? (
        <ul>
          {items.map((index) => (
            <li key={index}>
              <button type="button" onClick={() => select(index, { focus: true, zoom: false })} aria-label={format(copy.showOnMap, { title: data!.label[index] })}>
                <span className="concept-map-dot" style={{ background: data!.domains[data!.domain[index]].color }} aria-hidden="true" />
                <span>{data!.label[index]}</span>
              </button>
              <Link href={conceptHref(index) as Route} prefetch={false} aria-label={format(copy.openConceptNamed, { title: data!.label[index] })} title={copy.openConcept}>
                <ArrowUpRight aria-hidden="true" size={15} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="concept-map-muted">{copy.noLinks}</p>
      )}
    </div>
  );

  return (
    <section className="concept-map" aria-label={copy.regionLabel} lang={language}>
      <header className="concept-map-header">
        <p className="result-summary" role="status">
          {data ? (hiddenDomains.size ? format(copy.filteredSummary, { visible: visibleCount, concepts: data.total.nodes }) : summary) : "\u00a0"}
        </p>
      </header>

      <div
        ref={frameRef}
        className={`concept-map-frame${fullscreen ? " is-fullscreen" : ""}${selected !== null && data ? " has-selection" : ""}`}
        data-loading={status !== "error" && status !== "unsupported" && !data ? "true" : undefined}
      >
        <div className="concept-map-stage-wrap">
          <div
            ref={stageRef}
            className="concept-map-stage"
            role="application"
            aria-roledescription={copy.roleDescription}
            aria-label={summary ? `${copy.regionLabel}. ${summary}` : copy.regionLabel}
            aria-describedby={helpId}
            aria-busy={!data}
            tabIndex={0}
            onKeyDown={onStageKeyDown}
          />
          <div className="concept-map-toolbar">
            <div className="concept-map-search">
              <Search aria-hidden="true" size={17} />
              <input
                type="search"
                role="combobox"
                aria-label={copy.searchLabel}
                aria-expanded={showResults}
                aria-controls={resultsId}
                aria-autocomplete="list"
                aria-activedescendant={showResults && activeIndex >= 0 ? `${resultsId}-${activeIndex}` : undefined}
                autoComplete="off"
                spellCheck={false}
                placeholder={copy.searchPlaceholder}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveResult(0);
                  setResultsOpen(true);
                  void loadEverything();
                }}
                onFocus={() => {
                  setResultsOpen(true);
                  void loadEverything();
                }}
                onBlur={() => window.setTimeout(() => setResultsOpen(false), 150)}
                onKeyDown={onSearchKeyDown}
              />
              {query && (
                <button type="button" className="concept-map-search-clear" onClick={() => setQuery("")} aria-label={copy.clearSearch} title={copy.clearSearch}>
                  <X aria-hidden="true" size={15} />
                </button>
              )}
              <ul id={resultsId} role="listbox" aria-label={copy.searchLabel} className="concept-map-search-results" hidden={!showResults}>
                {search?.results.map((index, position) => (
                  <li
                    key={index}
                    id={`${resultsId}-${position}`}
                    role="option"
                    aria-selected={position === activeIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseResult(index)}
                  >
                    <span className="concept-map-dot" style={{ background: data!.domains[data!.domain[index]].color }} aria-hidden="true" />
                    <span className="concept-map-result-label">{data!.label[index]}</span>
                    <span className="concept-map-result-domain">{domainLabel(data!.domain[index])}</span>
                  </li>
                ))}
                {search && search.results.length === 0 && (
                  <li className="concept-map-search-empty" role="option" aria-selected="false" aria-disabled="true">
                    {copy.searchNoResults}
                  </li>
                )}
              </ul>
              <p className="sr-only" aria-live="polite">
                {search ? (search.matches.size ? format(copy.searchMatches, { count: search.matches.size }) : copy.searchNoResults) : ""}
              </p>
            </div>
            <div className="concept-map-controls">
              <button type="button" className="concept-map-control" onClick={() => rendererRef.current?.zoomIn()} aria-label={copy.zoomIn} title={copy.zoomIn}>
                <Plus aria-hidden="true" size={18} />
              </button>
              <button type="button" className="concept-map-control" onClick={() => rendererRef.current?.zoomOut()} aria-label={copy.zoomOut} title={copy.zoomOut}>
                <Minus aria-hidden="true" size={18} />
              </button>
              <button type="button" className="concept-map-control concept-map-reset" onClick={() => rendererRef.current?.reset()} aria-label={copy.resetView} title={copy.resetView}>
                <Scan aria-hidden="true" size={17} />
                <span>{copy.resetView}</span>
              </button>
              {canFullscreen && (
                <button
                  type="button"
                  className="concept-map-control"
                  onClick={toggleFullscreen}
                  aria-label={fullscreen ? copy.exitFullscreen : copy.enterFullscreen}
                  title={fullscreen ? copy.exitFullscreen : copy.enterFullscreen}
                  aria-pressed={fullscreen}
                >
                  {fullscreen ? <Minimize2 aria-hidden="true" size={17} /> : <Maximize2 aria-hidden="true" size={17} />}
                </button>
              )}
            </div>
          </div>
          {(status === "error" || status === "unsupported") && (
            <div className="concept-map-status" role="alert">
              <p>{status === "error" ? copy.loadError : copy.webglUnavailable}</p>
              <div className="concept-map-status-actions">
                {status === "error" && (
                  <button type="button" className="button secondary" onClick={() => setAttempt((value) => value + 1)}>
                    {copy.retry}
                  </button>
                )}
                <Link href={listHref as Route} className="button secondary" prefetch={false}>
                  {copy.openList}
                </Link>
              </div>
            </div>
          )}
          <p className="sr-only" role="status">
            {!data && status !== "error" && status !== "unsupported" ? copy.loading : ""}
          </p>
          <p id={helpId} className="concept-map-help">
            {copy.keyboardHelp}
          </p>
        </div>

        <aside className="concept-map-selection" aria-label={data && selected !== null ? data.label[selected] : copy.selectionHint}>
          {data && neighbors && selected !== null ? (
            <>
              <div className="concept-map-selection-heading">
                <span className="concept-map-dot is-large" style={{ background: data.domains[data.domain[selected]].color }} aria-hidden="true" />
                <h2>{selectedTitleHtml ? <span className="markdown-inline" dangerouslySetInnerHTML={{ __html: selectedTitleHtml }} /> : data.label[selected]}</h2>
                <button type="button" className="concept-map-close" onClick={() => select(null)} aria-label={copy.closeSelection} title={copy.closeSelection}>
                  <X aria-hidden="true" size={16} />
                </button>
              </div>
              <p className="concept-map-meta">
                <span>{domainLabel(data.domain[selected])}</span>
                <span>{kindLabels[KINDS[data.kind[selected]]] ?? KINDS[data.kind[selected]]}</span>
                <span>{statusLabels[STATUSES[data.status[selected]]] ?? STATUSES[data.status[selected]]}</span>
                <span>{format(copy.linkCount, { count: data.degree[selected] })}</span>
              </p>
              <Link href={conceptHref(selected) as Route} className="button concept-map-open" prefetch={false}>
                <span>{copy.openConcept}</span>
                <ArrowUpRight aria-hidden="true" size={16} />
              </Link>
              {neighborList(copy.cites, neighbors.cites)}
              {neighborList(copy.citedBy, neighbors.citedBy)}
            </>
          ) : (
            <p className="concept-map-muted concept-map-selection-hint">{copy.selectionHint}</p>
          )}
        </aside>

        <aside className={`concept-map-domains${!compact || domainsOpen ? " is-open" : ""}`} aria-label={copy.domains}>
          {compact ? (
            <h2>
              <button type="button" aria-expanded={domainsOpen} aria-controls={domainListId} onClick={() => setDomainsOpen((open) => !open)}>
                <span>{copy.toggleDomains}</span>
                {hiddenDomains.size > 0 && data && <span className="concept-map-domain-count">{data.domains.length - hiddenDomains.size}/{data.domains.length}</span>}
                <ChevronDown aria-hidden="true" size={16} />
              </button>
            </h2>
          ) : (
            <h2>{copy.domains}</h2>
          )}
          <div id={domainListId} className="concept-map-domain-body" hidden={compact && !domainsOpen}>
            <div className="concept-map-domain-actions">
              <button type="button" onClick={() => setHiddenDomains(new Set())} disabled={!data || hiddenDomains.size === 0}>
                {copy.allDomains}
              </button>
              <button
                type="button"
                onClick={() => data && setHiddenDomains(new Set(data.domains.map((_, index) => index)))}
                disabled={!data || hiddenDomains.size === data.domains.length}
              >
                {copy.noDomains}
              </button>
            </div>
            <ul>
              {data?.domains.map((domain, index) => (
                <li key={domain.code}>
                  <label>
                    <input type="checkbox" checked={!hiddenDomains.has(index)} onChange={() => toggleDomain(index)} />
                    <span className="concept-map-dot" style={{ background: domain.color }} aria-hidden="true" />
                    <span className="concept-map-domain-label">{domainLabel(index)}</span>
                    <span className="concept-map-domain-count">{domain.count}</span>
                  </label>
                  <button
                    type="button"
                    className="concept-map-domain-only"
                    onClick={() => setHiddenDomains(new Set(data.domains.map((_, other) => other).filter((other) => other !== index)))}
                    aria-label={format(copy.onlyDomainNamed, { domain: domainLabel(index) })}
                    title={copy.onlyDomain}
                  >
                    <Scan aria-hidden="true" size={13} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
