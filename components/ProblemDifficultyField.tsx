"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { MAX_PROBLEM_DIFFICULTY, MIN_PROBLEM_DIFFICULTY } from "@/lib/problems";
import { FieldHelp } from "@/components/FieldHelp";
import { PROBLEM_DIFFICULTY_HELP, problemDifficultyTone } from "@/lib/problem-difficulty";

const UNSET_DIFFICULTY_POSITION = 50;
const SLIDER_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

type ProblemDifficultyFieldProps = {
  defaultValue?: number | null;
  help?: string;
  label?: string;
  /** When true and no default value is given, the field starts empty until the user moves the slider. */
  allowUnset?: boolean;
  unsetHint?: string;
};

export function ProblemDifficultyField({
  defaultValue,
  help = PROBLEM_DIFFICULTY_HELP,
  label = "Difficulty",
  allowUnset = false,
  unsetHint
}: ProblemDifficultyFieldProps) {
  const [value, setValue] = useState<number | null>(defaultValue ?? (allowUnset ? null : 50));
  const isSet = value !== null;
  const sliderValue = value ?? UNSET_DIFFICULTY_POSITION;
  const position = ((sliderValue - MIN_PROBLEM_DIFFICULTY) / (MAX_PROBLEM_DIFFICULTY - MIN_PROBLEM_DIFFICULTY)) * 100;
  const tone = isSet ? problemDifficultyTone(sliderValue) : "#a59d8a";
  // A click on the slider's current position fires no change event, so commit on release too.
  const commit = (target: HTMLInputElement) => setValue(Number(target.value));

  return (
    <label className={isSet ? "problem-compose-difficulty" : "problem-compose-difficulty is-unset"}>
      <span className="field-label-with-help text-sm font-medium">
        {label}
        {help && <FieldHelp text={help} />}
      </span>
      <span className="problem-compose-difficulty-row">
        <input
          name={isSet ? "difficulty" : undefined}
          type="range"
          min={MIN_PROBLEM_DIFFICULTY}
          max={MAX_PROBLEM_DIFFICULTY}
          value={sliderValue}
          onChange={(event) => commit(event.currentTarget)}
          onPointerUp={(event) => commit(event.currentTarget)}
          onKeyUp={(event) => {
            if (SLIDER_KEYS.has(event.key)) commit(event.currentTarget);
          }}
          style={{
            "--difficulty-value": isSet ? `${position}%` : "0%",
            "--difficulty-tone": tone
          } as CSSProperties}
        />
        <strong style={{ color: tone }}>{isSet ? value : "—"}</strong>
      </span>
      {!isSet && unsetHint && <span className="muted text-xs">{unsetHint}</span>}
    </label>
  );
}
