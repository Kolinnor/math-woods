"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

type DifficultyRange = {
  value: string;
  label: string;
  min?: number;
  max?: number;
};

type ProblemDifficultyFilterProps = {
  ranges: readonly DifficultyRange[];
  selectedRange: string;
  customBounds: boolean;
  initialMin?: number;
  initialMax?: number;
  labels?: {
    minimum: string;
    maximum: string;
    preset: string;
    custom: string;
  };
};

const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 100;

function clampDifficulty(value: number) {
  if (!Number.isFinite(value)) return MIN_DIFFICULTY;
  return Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, Math.round(value)));
}

function difficultyPosition(value: number) {
  return ((value - MIN_DIFFICULTY) / (MAX_DIFFICULTY - MIN_DIFFICULTY)) * 100;
}

function initialSliderValue(value: number | undefined, fallback: number) {
  return value === undefined ? fallback : clampDifficulty(value);
}

export function ProblemDifficultyFilter({
  ranges,
  selectedRange,
  customBounds,
  initialMin,
  initialMax,
  labels = {
    minimum: "Minimum difficulty",
    maximum: "Maximum difficulty",
    preset: "Difficulty preset",
    custom: "Custom difficulty"
  }
}: ProblemDifficultyFilterProps) {
  const [minValue, setMinValue] = useState(() => initialSliderValue(initialMin, MIN_DIFFICULTY));
  const [maxValue, setMaxValue] = useState(() => initialSliderValue(initialMax, MAX_DIFFICULTY));
  const [mode, setMode] = useState(() => (customBounds ? "custom" : selectedRange));

  useEffect(() => {
    setMinValue(initialSliderValue(initialMin, MIN_DIFFICULTY));
    setMaxValue(initialSliderValue(initialMax, MAX_DIFFICULTY));
    setMode(customBounds ? "custom" : selectedRange);
  }, [customBounds, initialMax, initialMin, selectedRange]);

  function choosePreset(value: string) {
    const nextRange = ranges.find((range) => range.value === value);
    setMode(value);
    if (nextRange) {
      setMinValue(initialSliderValue(nextRange.min, MIN_DIFFICULTY));
      setMaxValue(initialSliderValue(nextRange.max, MAX_DIFFICULTY));
    }
  }

  function chooseMin(value: number) {
    const nextValue = Math.min(clampDifficulty(value), maxValue);
    setMode("custom");
    setMinValue(nextValue);
  }

  function chooseMax(value: number) {
    const nextValue = Math.max(clampDifficulty(value), minValue);
    setMode("custom");
    setMaxValue(nextValue);
  }

  const isCustom = mode === "custom";
  const submittedRange = isCustom ? "" : mode;
  const submittedMin = isCustom && minValue > MIN_DIFFICULTY ? String(minValue) : "";
  const submittedMax = isCustom && maxValue < MAX_DIFFICULTY ? String(maxValue) : "";
  const sliderStyle = {
    "--difficulty-min": `${difficultyPosition(minValue)}%`,
    "--difficulty-max": `${difficultyPosition(maxValue)}%`
  } as CSSProperties;

  return (
    <>
      <input type="hidden" name="difficultyRange" value={submittedRange} />
      <input type="hidden" name="difficultyMin" value={submittedMin} />
      <input type="hidden" name="difficultyMax" value={submittedMax} />

      <div className="problem-difficulty-control">
        <div className="problem-difficulty-slider" style={sliderStyle}>
          <div className="problem-difficulty-slider-track" aria-hidden="true" />
          <input
            aria-label={labels.minimum}
            max={MAX_DIFFICULTY}
            min={MIN_DIFFICULTY}
            onChange={(event) => chooseMin(Number(event.target.value))}
            type="range"
            value={minValue}
          />
          <input
            aria-label={labels.maximum}
            max={MAX_DIFFICULTY}
            min={MIN_DIFFICULTY}
            onChange={(event) => chooseMax(Number(event.target.value))}
            type="range"
            value={maxValue}
          />
        </div>

        <div className="problem-difficulty-values">
          <span>{minValue} / 100</span>
          <span>{maxValue} / 100</span>
        </div>

        <select aria-label={labels.preset} onChange={(event) => choosePreset(event.target.value)} value={mode}>
          {isCustom && <option value="custom">{labels.custom}</option>}
          {ranges.map((range) => (
            <option key={range.value || "any"} value={range.value}>
              {range.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
