"use client";

import { useState } from "react";

type ProblemVerificationFieldsProps = {
  initialMode?: string;
  initialPrompt?: string;
  initialAnswer?: string;
  modeOptions: [string, string][];
  labels?: {
    title: string;
    mode: string;
    question: string;
    questionPlaceholder: string;
    answer: string;
    answerPlaceholder: string;
  };
};

export function ProblemVerificationFields({
  initialMode = "NONE",
  initialPrompt = "",
  initialAnswer = "",
  modeOptions,
  labels
}: ProblemVerificationFieldsProps) {
  const copy = labels ?? {
    title: "Solve verification",
    mode: "Verification mode",
    question: "Verification question",
    questionPlaceholder: "For example: What is the last letter of the answer?",
    answer: "Expected short answer",
    answerPlaceholder: "Used only for short answer check"
  };
  const [mode, setMode] = useState(initialMode);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [answer, setAnswer] = useState(initialAnswer);
  const hasVerification = mode !== "NONE";
  const needsShortAnswer = mode === "SELF_CHECK";

  return (
    <fieldset className="origin-fields grid gap-4">
      <legend className="font-semibold">{copy.title}</legend>
      <label className="grid gap-2">
        <span className="text-sm font-medium">{copy.mode}</span>
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
            <span className="text-sm font-medium">{copy.question}</span>
            <input
              name="verificationPrompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={copy.questionPlaceholder}
            />
          </label>
          {needsShortAnswer && (
            <label className="grid gap-2">
              <span className="text-sm font-medium">{copy.answer}</span>
              <input
                name="verificationAnswer"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder={copy.answerPlaceholder}
              />
            </label>
          )}
        </>
      )}
    </fieldset>
  );
}
