"use client";

import { Check, Layers } from "lucide-react";
import { useEffect, useState } from "react";

type BackgroundStyle = "plain" | "green" | "paper" | "contours";
type BackgroundTone = "sage" | "amber" | "blue" | "rose";

const styles: Array<{
  value: BackgroundStyle;
  label: string;
  description: string;
}> = [
  {
    value: "plain",
    label: "Plain",
    description: "Clean color tint."
  },
  {
    value: "green",
    label: "Wash",
    description: "Soft color field."
  },
  {
    value: "paper",
    label: "Paper",
    description: "Soft reading texture."
  },
  {
    value: "contours",
    label: "Contours",
    description: "Faint hill lines."
  }
];

const tones: Array<{
  value: BackgroundTone;
  label: string;
  description: string;
}> = [
  {
    value: "sage",
    label: "Sage",
    description: "The Math Woods default."
  },
  {
    value: "amber",
    label: "Amber",
    description: "Warmer, still quiet."
  },
  {
    value: "blue",
    label: "Blue",
    description: "Cooler and clean."
  },
  {
    value: "rose",
    label: "Clay",
    description: "A muted red tint."
  }
];

function isBackgroundStyle(value: string | undefined): value is BackgroundStyle {
  return value === "plain" || value === "green" || value === "paper" || value === "contours";
}

function isBackgroundTone(value: string | undefined): value is BackgroundTone {
  return value === "sage" || value === "amber" || value === "blue" || value === "rose";
}

export function BackgroundStylePicker() {
  const [selected, setSelected] = useState<BackgroundStyle>("green");
  const [tone, setTone] = useState<BackgroundTone>("sage");

  useEffect(() => {
    const current = document.documentElement.dataset.background;
    const currentTone = document.documentElement.dataset.backgroundTone;
    setSelected(isBackgroundStyle(current) ? current : "green");
    setTone(isBackgroundTone(currentTone) ? currentTone : "sage");
  }, []);

  function choose(value: BackgroundStyle) {
    document.documentElement.dataset.background = value;
    localStorage.setItem("math-woods-background", value);
    setSelected(value);
  }

  function chooseTone(value: BackgroundTone) {
    document.documentElement.dataset.backgroundTone = value;
    localStorage.setItem("math-woods-background-tone", value);
    setTone(value);
  }

  return (
    <div className="appearance-picker">
      <div className="appearance-picker-heading">
        <Layers size={18} aria-hidden="true" />
        <div>
          <h2>Background style</h2>
          <p className="muted">Local to this browser. Pick a motif, then a background tone.</p>
        </div>
      </div>

      <div className="appearance-control-group">
        <h3>Motif</h3>
        <div className="background-style-grid" role="group" aria-label="Background motif">
          {styles.map((style) => (
            <button
              key={style.value}
              type="button"
              className={selected === style.value ? "background-style-option active" : "background-style-option"}
              aria-pressed={selected === style.value}
              onClick={() => choose(style.value)}
            >
              <span className={`background-style-preview background-style-preview-${style.value}`} aria-hidden="true" />
              <span className="background-style-copy">
                <span className="background-style-title">
                  {style.label}
                  {selected === style.value && <Check size={15} aria-hidden="true" />}
                </span>
                <span>{style.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="appearance-control-group">
        <h3>Tone</h3>
        <div className="background-tone-grid" role="group" aria-label="Background tone">
          {tones.map((item) => (
            <button
              key={item.value}
              type="button"
              className={tone === item.value ? "background-tone-option active" : "background-tone-option"}
              aria-pressed={tone === item.value}
              onClick={() => chooseTone(item.value)}
            >
              <span className={`background-tone-swatch background-tone-swatch-${item.value}`} aria-hidden="true" />
              <span className="background-style-copy">
                <span className="background-style-title">
                  {item.label}
                  {tone === item.value && <Check size={15} aria-hidden="true" />}
                </span>
                <span>{item.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
