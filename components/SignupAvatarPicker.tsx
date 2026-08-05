"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import {
  AVATAR_BACKGROUND_OPTIONS,
  DEFAULT_AVATAR_PRESETS,
  avatarBackgroundOption,
  defaultAvatarBackgroundForUsername,
  defaultAvatarPath,
  defaultAvatarPresetForUsername,
  type AvatarBackgroundId,
  type DefaultAvatarPreset
} from "@/lib/avatar-presets";

type SignupAvatarPickerProps = {
  labels: {
    animal: string;
    background: string;
    backgroundColors: Record<AvatarBackgroundId, string>;
    help: string;
    presetLabels: Record<DefaultAvatarPreset, string>;
    title: string;
  };
  seed: string;
};

export function SignupAvatarPicker({ labels, seed }: SignupAvatarPickerProps) {
  const [preset, setPreset] = useState<DefaultAvatarPreset>(() => defaultAvatarPresetForUsername(seed));
  const [background, setBackground] = useState<AvatarBackgroundId>(
    () => defaultAvatarBackgroundForUsername(seed).id
  );
  const backgroundColor = avatarBackgroundOption(seed, background).color;

  return (
    <fieldset className="signup-avatar-picker">
      <legend>{labels.title}</legend>
      <p>{labels.help}</p>
      <input type="hidden" name="avatarPreset" value={preset} />
      <input type="hidden" name="avatarBackground" value={background} />

      <div className="signup-avatar-picker-layout">
        <div className="signup-avatar-preview" style={{ backgroundColor }} aria-hidden="true">
          <img src={defaultAvatarPath(preset)} alt="" />
        </div>

        <div className="signup-avatar-picker-controls">
          <span className="signup-avatar-picker-label">{labels.animal}</span>
          <div className="signup-avatar-presets" role="group" aria-label={labels.animal}>
            {DEFAULT_AVATAR_PRESETS.map((option) => {
              const selected = option === preset;
              return (
                <button
                  key={option}
                  type="button"
                  className={selected ? "selected" : ""}
                  style={{ backgroundColor }}
                  aria-label={labels.presetLabels[option]}
                  aria-pressed={selected}
                  title={labels.presetLabels[option]}
                  onClick={() => setPreset(option)}
                >
                  <img src={defaultAvatarPath(option)} alt="" />
                  {selected && <Check size={11} aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          <span className="signup-avatar-picker-label">{labels.background}</span>
          <div className="signup-avatar-backgrounds" role="group" aria-label={labels.background}>
            {AVATAR_BACKGROUND_OPTIONS.map((option) => {
              const selected = option.id === background;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={selected ? "selected" : ""}
                  style={{ backgroundColor: option.color }}
                  aria-label={labels.backgroundColors[option.id]}
                  aria-pressed={selected}
                  title={labels.backgroundColors[option.id]}
                  onClick={() => setBackground(option.id)}
                >
                  {selected && <Check size={12} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </fieldset>
  );
}
