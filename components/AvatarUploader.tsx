"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";

type AvatarUploaderProps = {
  initialAvatarUrl: string | null;
  labels: {
    choose: string;
    help: string;
    invalid: string;
    remove: string;
    removed: string;
    title: string;
    uploadFailed: string;
    uploading: string;
    uploaded: string;
  };
  user: {
    displayName: string | null;
    username: string;
  };
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function AvatarUploader({ initialAvatarUrl, labels, user }: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
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
      setMessage(labels.removed);
    } catch (removeError) {
      setError(true);
      setMessage(removeError instanceof Error ? removeError.message : labels.uploadFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="profile-avatar-editor">
      <UserAvatar user={{ ...user, avatarUrl }} size="xl" />
      <div>
        <h2>{labels.title}</h2>
        <p>{labels.help}</p>
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
          {avatarUrl && (
            <button type="button" className="secondary" disabled={busy} onClick={() => void remove()}>
              <Trash2 size={16} aria-hidden="true" />
              {labels.remove}
            </button>
          )}
        </div>
        {message && <p className={error ? "form-error" : "profile-avatar-status"} role="status">{message}</p>}
      </div>
    </section>
  );
}
