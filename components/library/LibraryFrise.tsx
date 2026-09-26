import type { CSSProperties } from "react";
import Link from "next/link";
import { libraryDateLabel, libraryEraOfPeriod, libraryEraRange, libraryEraStyle, libraryYearLabel, type LibraryEraView } from "@/lib/library-display";

import type { FriseMilestone, FrisePerson, FriseTotals } from "@/lib/library-frise";

/** Where an item sits, in % of the timeline width, and how its label is shown. */
type LabelMode = "inside" | "after" | null;
type Position = { left: number; width: number; lane: number; label: LabelMode };
type Placed<T> = T & Position;

type Lanes = { periods: number; events: number; people: number };
const LANES: Lanes = { periods: 3, events: 5, people: 12 };
/** Approximate width of one character of an 11–12 px label, in % of the timeline (at least 980 px wide). */
const CHARACTER = 0.6;
const labelWidth = (text: string) => text.length * CHARACTER + 1.4;

/**
 * Each era gets the same width, and time runs linearly inside an era: the early millennia stay
 * readable next to the crowded recent centuries.
 */
function scale(eras: LibraryEraView[]) {
  return (year: number) => {
    if (!eras.length) return 0;
    let index = 0;
    eras.forEach((era, position) => { if (year >= era.startYear) index = position; });
    const era = eras[index];
    const span = Math.max(1, era.endYear + 1 - era.startYear);
    const inside = Math.min(1, Math.max(0, (year - era.startYear) / span));
    return (100 * (index + inside)) / eras.length;
  };
}

/**
 * Lane packing that labels as many items as possible without leaving any out: an item first looks for
 * a lane with room for its label (inside its bar when it fits, otherwise just after it), then for a
 * lane with room for the item alone, and finally takes the room of a neighbour's label.
 */
function pack<T>(items: T[], box: (item: T) => { left: number; width: number; text: string }, lanes: number, gap: number): Placed<T>[] {
  type Slot = { start: number; core: number; end: number; item: Position };
  const occupied: Slot[][] = [];
  const fits = (lane: Slot[], start: number, end: number, core: boolean) =>
    lane.every(slot => end + gap <= slot.start || start >= (core ? slot.core : slot.end) + gap);
  const placed: Placed<T>[] = [];
  for (const item of [...items].sort((a, b) => box(a).left - box(b).left)) {
    const { left, width, text } = box(item);
    const needed = labelWidth(text);
    const inside = needed <= width;
    const core = left + width;
    const labelled = inside ? core : core + needed;
    const entry = { ...item, left, width, lane: 0, label: null } as Placed<T>;
    const position: Position = entry;
    const put = (index: number, end: number, label: LabelMode) => {
      while (occupied.length <= index) occupied.push([]);
      position.lane = index;
      position.label = label;
      occupied[index].push({ start: left, core, end, item: position });
      placed.push(entry);
    };
    const lanesNow = () => Math.min(Math.max(lanes, occupied.length), occupied.length + 1);
    const find = (end: number, core: boolean) => { for (let index = 0; index < lanesNow(); index += 1) if (fits(occupied[index] ?? [], left, end, core)) return index; return -1; };
    let lane = labelled <= 100 ? find(labelled, false) : -1;
    if (lane !== -1) { put(lane, labelled, inside ? "inside" : "after"); continue; }
    lane = find(core, false);
    if (lane !== -1) { put(lane, core, null); continue; }
    // Last resort: hide the labels that are in the way.
    lane = find(core, true);
    // Selection already bounds the number of entries. Grow the track rather than
    // silently discarding a selected (possibly editor-featured) entry.
    if (lane === -1) {
      put(occupied.length, labelled <= 100 ? labelled : core, labelled <= 100 ? (inside ? "inside" : "after") : null);
      continue;
    }
    for (const slot of occupied[lane]) {
      if (slot.end + gap > left && slot.start < core + gap && slot.item.label === "after") { slot.item.label = null; slot.end = slot.core; }
    }
    put(lane, core, null);
  }
  return placed;
}

/** Round years for the axis of a single era: at most about eight ticks. */
function axisYears(era: LibraryEraView) {
  const span = era.endYear + 1 - era.startYear;
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find(value => span / value <= 8) ?? 1000;
  const years: number[] = [];
  for (let year = Math.ceil(era.startYear / step) * step; year <= era.endYear; year += step) if (year !== 0) years.push(year);
  return years;
}

export function LibraryFrise({ locale, eras, milestones, people, totals, lanes: laneLimits = LANES }: {
  locale: "fr" | "en";
  eras: LibraryEraView[];
  milestones: FriseMilestone[];
  people: FrisePerson[];
  /** Size of each era, shown under the columns with links to the catalogues. */
  totals?: FriseTotals;
  lanes?: Lanes;
}) {
  const x = scale(eras);
  const fr = locale === "fr";
  const periods = pack(milestones.filter(item => item.period && item.endYear != null), item => ({ left: x(item.sortYear), width: Math.max(0.8, x(item.endYear!) - x(item.sortYear)), text: item.title }), laneLimits.periods, 0.6);
  const events = pack(milestones.filter(item => !(item.period && item.endYear != null)), item => ({ left: x(item.sortYear), width: 1.2, text: item.title }), laneLimits.events, 0.3);
  const lives = pack(people, person => ({ left: x(person.from), width: Math.max(0.9, x(person.to) - x(person.from)), text: person.short }), laneLimits.people, 0.4);
  const single = eras.length === 1 ? eras[0] : null;
  const pct = (value: number) => `${Math.round(value * 1000) / 1000}%`;
  const lanes = (placed: { lane: number }[]) => placed.reduce((max, item) => Math.max(max, item.lane + 1), 0);
  const tipSide = (left: number) => left > 62 ? "end" : "start";
  const label = (shown: LabelMode, text: string) => shown && <span className="library-frise-label" data-outside={shown === "after" ? "true" : undefined}>{text}</span>;

  return <div className="library-frise-scroll">
    <div className="library-frise" style={{ "--eras": eras.length } as CSSProperties}>
      <div className="library-frise-columns" aria-hidden="true">{eras.map(era => <span key={era.slug} style={libraryEraStyle(era)} />)}</div>

      {single ? <div className="library-frise-axis" style={libraryEraStyle(single)} aria-hidden="true">
        {axisYears(single).map(year => <span key={year} style={{ left: pct(x(year)) }} data-edge={x(year) < 3 ? "start" : x(year) > 97 ? "end" : undefined}>{libraryYearLabel(year, locale)}</span>)}
      </div> : <ol className="library-frise-eras">{eras.map((era, index) => <li key={era.slug} style={libraryEraStyle(era)}>
        <Link href={`/library/history?era=${era.slug}` as never}>
          <strong>{era.name[locale]}</strong>
          <span>{libraryEraRange(era, locale, index === eras.length - 1)}</span>
        </Link>
      </li>)}</ol>}

      {periods.length > 0 && <div className="library-frise-track" data-track="periods" style={{ height: `${lanes(periods) * 26 + 8}px` }} aria-label={fr ? "Périodes" : "Periods"} role="group">
        {periods.map(item => <Link key={item.slug} href={`/library/history/${item.slug}` as never} className="library-frise-period"
          style={{ left: pct(item.left), width: pct(item.width), top: `${item.lane * 26 + 4}px`, ...libraryEraStyle(libraryEraOfPeriod(eras, item.sortYear, item.endYear)) }}>
          {label(item.label, item.title)}
          <span className="library-frise-tip" data-side={tipSide(item.left)}><em>{libraryDateLabel(item.dateLabel)}</em>{item.title}</span>
        </Link>)}
      </div>}

      {events.length > 0 && <div className="library-frise-track" data-track="events" style={{ height: `${lanes(events) * 24 + 8}px` }} aria-label={fr ? "Repères" : "Milestones"} role="group">
        {events.map(item => <Link key={item.slug} href={`/library/history/${item.slug}` as never} className="library-frise-event"
          style={{ left: pct(item.left), top: `${item.lane * 24 + 4}px`, ...libraryEraStyle(libraryEraOfPeriod(eras, item.sortYear, item.sortYear)) }}>
          <span className="library-frise-dot" aria-hidden="true" />
          {item.label && <span className="library-frise-label">{item.title}</span>}
          <span className="library-frise-tip" data-side={tipSide(item.left)}><em>{libraryDateLabel(item.dateLabel)} · {item.typeLabel}</em>{item.title}</span>
        </Link>)}
      </div>}

      {lives.length > 0 && <div className="library-frise-track" data-track="people" style={{ height: `${lanes(lives) * 22 + 8}px` }} aria-label={fr ? "Mathématiciens" : "Mathematicians"} role="group">
        {lives.map(person => <Link key={person.slug} href={`/library/mathematicians/${person.slug}` as never} className="library-frise-life"
          style={{ left: pct(person.left), width: pct(person.width), top: `${person.lane * 22 + 4}px`, ...libraryEraStyle(libraryEraOfPeriod(eras, person.from, person.to)) }}>
          {label(person.label, person.short)}
          <span className="library-frise-tip" data-side={tipSide(person.left)}><em>{person.lifespan || `${libraryYearLabel(person.from, locale)} – ${libraryYearLabel(person.to, locale)}`}</em>{person.name}</span>
        </Link>)}
      </div>}

      {totals && <ol className="library-frise-totals">{eras.map(era => {
        const total = totals[era.slug] ?? { people: 0, milestones: 0 };
        return <li key={era.slug} style={libraryEraStyle(era)}>
          <Link href={`/library/mathematicians?era=${era.slug}&languagesSet=1&language=fr&language=en` as never}>{fr ? `${total.people} mathématicien${total.people === 1 ? "" : "s"}` : `${total.people} mathematician${total.people === 1 ? "" : "s"}`}</Link>
          <Link href={`/library/history?era=${era.slug}` as never}>{fr ? `${total.milestones} repère${total.milestones === 1 ? "" : "s"}` : `${total.milestones} milestone${total.milestones === 1 ? "" : "s"}`}</Link>
        </li>;
      })}</ol>}
    </div>
  </div>;
}
