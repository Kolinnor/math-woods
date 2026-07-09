"use client";

import { useState } from "react";

type ProblemVerificationFieldsProps = {
  initialMode?: string;
  initialPrompt?: string;
  initialAnswer?: string;
  modeOptions: [string, string][];
};

export function ProblemVerificationFields({
  initialMode = "NONE",
  initialPrompt = "",
  initialAnswer = "",
  modeOptions
}: ProblemVerificationFieldsProps) {
  const [mode, setMode] = useState(initialMode);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [answer, setAnswer] = useState(initialAnswer);
  const hasVerification = mode !== "NONE";
  const needsShortAnswer = mode === "SELF_CHECK";

  return (
    <fieldset className="origin-fields grid gap-4">
      <legend className="font-semibold">Solve verification</legend>
      <label className="grid gap-2">
        <span className="text-sm font-medium">Verification mode</span>
        <select name="verificationMode" value={mode} onChange={(event) => setMode(event.target.value)}>
          {modeOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {hasVerification && (
        <>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Verification question</span>
            <input
              name="verificationPrompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="For example: What is the last letter of the answer?"
            />
          </label>
          {needsShortAnswer && (
            <label className="grid gap-2">
              <span className="text-sm font-medium">Expected short answer</span>
              <input
                name="verificationAnswer"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Used only for short answer check"
              />
            </label>
          )}
        </>
      )}
    </fieldset>
  );
}
