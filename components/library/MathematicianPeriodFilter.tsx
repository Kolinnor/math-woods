"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { MIN_HISTORY_YEAR, historyPresets, historyYearLabel } from "@/lib/mathematician-browser";

export function MathematicianPeriodFilter({ locale, currentYear, initialEra, initialPeriod }: {
  locale: "fr" | "en"; currentYear: number; initialEra: string; initialPeriod: { from: number; to: number } | null;
}) {
  const fr = locale === "fr";
  const [from, setFrom] = useState(initialPeriod?.from ?? MIN_HISTORY_YEAR);
  const [to, setTo] = useState(initialPeriod?.to ?? currentYear);
  const [mode, setMode] = useState(initialEra || (initialPeriod ? "custom" : ""));
  const [fromText, setFromText] = useState(String(from));
  const [toText, setToText] = useState(String(to));
  useEffect(() => { setFromText(String(from)); setToText(String(to)); }, [from, to]);
  useEffect(() => {
    setFrom(initialPeriod?.from ?? MIN_HISTORY_YEAR);
    setTo(initialPeriod?.to ?? currentYear);
    setMode(initialEra || (initialPeriod ? "custom" : ""));
  }, [initialEra, initialPeriod?.from, initialPeriod?.to, currentYear]);
  const presets = historyPresets(currentYear);
  const position = (year: number) => `${100 * (year - MIN_HISTORY_YEAR) / (currentYear - MIN_HISTORY_YEAR)}%`;
  const style = { "--difficulty-min": position(from), "--difficulty-max": position(to) } as CSSProperties;
  const clamp = (year: number, previous = 1) => {
    const bounded = Math.max(MIN_HISTORY_YEAR, Math.min(currentYear, Math.round(year)));
    return bounded === 0 ? (previous > 0 ? -1 : 1) : bounded;
  };
  const changeFrom = (year: number) => { if (Number.isFinite(year)) { setFrom(Math.min(clamp(year, from), to)); setMode("custom"); } };
  const changeTo = (year: number) => { if (Number.isFinite(year)) { setTo(Math.max(clamp(year, to), from)); setMode("custom"); } };
  function commitYear(input: HTMLInputElement, start: boolean) {
    const raw = input.value.trim(), value = Number(raw);
    if (!raw || !Number.isInteger(value) || value === 0) {
      if (start) setFromText(String(from)); else setToText(String(to));
      return;
    }
    if (start) { const next = Math.min(clamp(value), to); changeFrom(next); setFromText(String(next)); }
    else { const next = Math.max(clamp(value), from); changeTo(next); setToText(String(next)); }
    const form = input.form;
    setTimeout(() => form?.requestSubmit(), 0);
  }
  return <fieldset className="mathematician-period-filter problem-filter-section">
    <legend>{fr ? "A vécu pendant la période" : "Lived during the period"}</legend>
    <input type="hidden" name="era" value={mode === "custom" ? "" : mode} />
    <input type="hidden" name="from" value={mode === "custom" ? from : ""} />
    <input type="hidden" name="to" value={mode === "custom" ? to : ""} />
    <div className="problem-difficulty-control">
      <select aria-label={fr ? "Grande période" : "Historical period"} value={mode} onChange={event => {
        const preset = presets.find(item => item.value === event.target.value);
        setMode(event.target.value); setFrom(preset?.from ?? MIN_HISTORY_YEAR); setTo(preset?.to ?? currentYear);
      }}>
        <option value="">{fr ? "Toutes les périodes" : "All periods"}</option>
        {mode === "custom" && <option value="custom">{fr ? "Période personnalisée" : "Custom period"}</option>}
        {presets.map(preset => <option key={preset.value} value={preset.value}>{preset[locale]}</option>)}
      </select>
      <div className="problem-difficulty-slider" style={style}>
        <div className="problem-difficulty-slider-track" aria-hidden="true" />
        <input type="range" min={MIN_HISTORY_YEAR} max={currentYear} value={from} aria-label={fr ? "Début de la période" : "Period start"} aria-valuetext={historyYearLabel(from, locale)}
          onInput={event => event.stopPropagation()} onChange={event => { event.stopPropagation(); changeFrom(Number(event.target.value)); }}
          onPointerUp={event => event.currentTarget.form?.requestSubmit()} onKeyUp={event => event.currentTarget.form?.requestSubmit()} />
        <input type="range" min={MIN_HISTORY_YEAR} max={currentYear} value={to} aria-label={fr ? "Fin de la période" : "Period end"} aria-valuetext={historyYearLabel(to, locale)}
          onInput={event => event.stopPropagation()} onChange={event => { event.stopPropagation(); changeTo(Number(event.target.value)); }}
          onPointerUp={event => event.currentTarget.form?.requestSubmit()} onKeyUp={event => event.currentTarget.form?.requestSubmit()} />
      </div>
      <div className="mathematician-year-inputs">
        <label><span>{fr ? "De" : "From"}</span><input aria-label={fr ? "Première année" : "First year"} type="number" min={MIN_HISTORY_YEAR} max={to} value={fromText} onInput={event => event.stopPropagation()} onChange={event => { event.stopPropagation(); setFromText(event.target.value); }} onBlur={event => commitYear(event.currentTarget, true)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commitYear(event.currentTarget, true); } }} /></label>
        <label><span>{fr ? "À" : "To"}</span><input aria-label={fr ? "Dernière année" : "Last year"} type="number" min={from} max={currentYear} value={toText} onInput={event => event.stopPropagation()} onChange={event => { event.stopPropagation(); setToText(event.target.value); }} onBlur={event => commitYear(event.currentTarget, false)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commitYear(event.currentTarget, false); } }} /></label>
      </div>
      <small>{mode ? `${historyYearLabel(from, locale)} – ${historyYearLabel(to, locale)}` : fr ? "Toutes les dates, y compris inconnues" : "All dates, including unknown dates"}</small>
    </div>
  </fieldset>;
}
