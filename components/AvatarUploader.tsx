"use client";

import { Camera, Check, Trees, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import {
  AVATAR_BACKGROUND_OPTIONS,
  DEFAULT_AVATAR_PRESETS,
  avatarBackgroundOption,
  avatarPresetFromUrl,
  defaultAvatarPath,
  defaultAvatarPresetForUsername,
  type AvatarBackgroundId,
  type DefaultAvatarPreset
} from "@/lib/avatar-presets";

type AvatarUploaderProps = {
  initialAvatarBackground: string | null;
  initialAvatarUrl: string | null;
  labels: {
    backgroundColors: Record<AvatarBackgroundId, string>;
    backgroundHelp: string;
    backgroundTitle: string;
    backgroundUpdated: string;
    choose: string;
    defaultFailed: string;
    defaultHelp: string;
    defaultOption: string;
    defaultTitle: string;
    defaultUpdated: string;
    help: string;
    invalid: string;
    presetLabel: (preset: string) => string;
    remove: string;
    removed: string;
    title: string;
    uploadHelp: string;
    uploadFailed: string;
    uploadOption: string;
    uploading: string;
    uploaded: string;
  };
  user: {
    displayName: string | null;
    username: string;
  };
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function AvatarUploader({
  initialAvatarBackground,
  initialAvatarUrl,
  labels,
  user
}: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initialPreset = avatarPresetFromUrl(initialAvatarUrl) ?? defaultAvatarPresetForUsername(user.username);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [mode, setMode] = useState<"default" | "upload">(
    initialAvatarUrl && !avatarPresetFromUrl(initialAvatarUrl) ? "upload" : "default"
  );
  const [avatarPreset, setAvatarPreset] = useState<DefaultAvatarPreset>(initialPreset);
  const [avatarBackground, setAvatarBackground] = useState(
    avatarBackgroundOption(user.username, initialAvatarBackground).id
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function upload(file: File) {
    if (!file.type.startsWith("image/") || file.size <= 0 || file.size > MAX_AVATAR_BYTES) {
      setError(true);
      setMessage(labels.invalid);
      return;
    }

    setBusy(true);
    setError(false);
    setMessage(labels.uploading);
    try {
      const formData = new FormData();
      formData.set("avatar", file);
      const response = await fetch("/api/profile/avatar", { method: "POST", body: formData });
      const result = await response.json().catch(() => null) as { avatarUrl?: string; error?: string } | null;
      if (!response.ok || !result?.avatarUrl) throw new Error(result?.error || labels.uploadFailed);
      setAvatarUrl(result.avatarUrl);
      setMode("upload");
      setMessage(labels.uploaded);
    } catch (uploadError) {
      setError(true);
      setMessage(uploadError instanceof Error ? uploadError.message : labels.uploadFailed);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError(false);
    setMessage(null);
    try {
      const response = await fetch("/api/profile/avatar", { method: "DELETE" });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || labels.uploadFailed);
      setAvatarUrl(null);
      setAvatarPreset(defaultAvatarPresetForUsername(user.username));
      setMode("default");
      setMessage(labels.removed);
    } catch (removeError) {
      setError(true);
      setMessage(removeError instanceof Error ? removeError.message : labels.uploadFailed);
    } finally {
      setBusy(false);
    }
  }

  async function updateDefaultAvatar(preset: DefaultAvatarPreset, background: AvatarBackgroundId) {
    const previousMode = mode;
    const previousPreset = avatarPreset;
    const previousBackground = avatarBackground;
    const previousAvatarUrl = avatarUrl;
    setMode("default");
    setAvatarPreset(preset);
    setAvatarBackground(background);
    setBusy(true);
    setError(false);
    setMessage(null);
    try {
      const response = await fetch("/api/profile/avatar", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ background, preset })
      });
      const result = await response.json().catch(() => null) as {
        avatarBackground?: AvatarBackgroundId;
        avatarUrl?: string;
        error?: string;
      } | null;
      if (!response.ok || !result?.avatarBackground || !result.avatarUrl) {
        throw new Error(result?.error || labels.defaultFailed);
      }
      setAvatarUrl(result.avatarUrl);
      setAvatarBackground(result.avatarBackground);
      setMessage(background === previousBackground ? labels.defaultUpdated : labels.backgroundUpdated);
    } catch (defaultAvatarError) {
      setMode(previousMode);
      setAvatarPreset(previousPreset);
      setAvatarBackground(previousBackground);
      setAvatarUrl(previousAvatarUrl);
      setError(true);
      setMessage(defaultAvatarError instanceof Error ? defaultAvatarError.message : labels.defaultFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="profile-avatar-editor">
      <UserAvatar
        user={{
          ...user,
          avatarBackground,
          avatarUrl: mode === "default" ? defaultAvatarPath(avatarPreset) : avatarUrl
        }}
        size="xl"
      />
      <div>
        <h2>{labels.title}</h2>
        <p>{labels.help}</p>
        <div className="profile-avatar-mode" role="tablist" aria-label={labels.title}>
          <button
            type="button"
            role="tab"
            className={mode === "default" ? "selected" : ""}
            aria-selected={mode === "default"}
            disabled={busy}
            onClick={() => {
              if (mode !== "default") void updateDefaultAvatar(avatarPreset, avatarBackground);
            }}
          >
            <Trees size={16} aria-hidden="true" />
            {labels.defaultOption}
          </button>
          <button
            type="button"
            role="tab"
            className={mode === "upload" ? "selected" : ""}
            aria-selected={mode === "upload"}
            disabled={busy}
            onClick={() => setMode("upload")}
          >
            <Camera size={16} aria-hidden="true" />
            {labels.uploadOption}
          </button>
        </div>

        {mode === "upload" ? (
          <div className="profile-avatar-upload" role="tabpanel">
            <p>{labels.uploadHelp}</p>
            <div className="profile-avatar-actions">
              <input
                ref={inputRef}
                type="file"
                accept="image/avif,image/jpeg,image/png,image/webp"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <button type="button" className="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
                <Camera size={16} aria-hidden="true" />
                {busy ? labels.uploading : labels.choose}
              </button>
              {avatarUrl && !avatarPresetFromUrl(avatarUrl) && (
                <button type="button" className="secondary" disabled={busy} onClick={() => void remove()}>
                  <Trash2 size={16} aria-hidden="true" />
                  {labels.remove}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="profile-avatar-default" role="tabpanel">
            <strong>{labels.defaultTitle}</strong>
            <p>{labels.defaultHelp}</p>
            <div className="profile-avatar-presets" role="group" aria-label={labels.defaultTitle}>
              {DEFAULT_AVATAR_PRESETS.map((preset) => {
                const selected = avatarPreset === preset;
                const label = labels.presetLabel(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    className={selected ? "profile-avatar-preset selected" : "profile-avatar-preset"}
                    style={{ backgroundColor: avatarBackgroundOption(user.username, avatarBackground).color }}
                    aria-label={label}
                    aria-pressed={selected}
                    title={label}
                    disabled={busy}
                    onClick={() => void updateDefaultAvatar(preset, avatarBackground)}
                  >
                    <img src={defaultAvatarPath(preset)} alt="" />
                    {selected && (
                      <span>
                        <Check size={13} aria-hidden="true" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mode === "default" && (
          <div className="profile-avatar-background">
            <strong>{labels.backgroundTitle}</strong>
            <p>{labels.backgroundHelp}</p>
            <div className="profile-avatar-swatches" role="group" aria-label={labels.backgroundTitle}>
              {AVATAR_BACKGROUND_OPTIONS.map((option) => {
                const selected = avatarBackground === option.id;
                const label = labels.backgroundColors[option.id];
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={selected ? "profile-avatar-swatch selected" : "profile-avatar-swatch"}
                    style={{ backgroundColor: option.color }}
                    aria-label={label}
                    aria-pressed={selected}
                    title={label}
                    disabled={busy}
                    onClick={() => void updateDefaultAvatar(avatarPreset, option.id)}
                  >
                    {selected && <Check size={14} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {message && <p className={error ? "form-error" : "profile-avatar-status"} role="status">{message}</p>}
      </div>
    </section>
  );
}
