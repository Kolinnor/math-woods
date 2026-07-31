"use client";

import { ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CHAT_IMAGE_ACCEPT, CHAT_IMAGE_MAX_INPUT_BYTES } from "@/lib/chat-image-config";

type ChatImageAttachmentInputProps = {
  compact?: boolean;
  labels: {
    attachImage: string;
    imageRequirements: string;
    removeImage: string;
  };
  onSelectionChange?: (selected: boolean) => void;
  resetSignal?: number;
};

export function ChatImageAttachmentInput({
  compact = false,
  labels,
  onSelectionChange,
  resetSignal = 0
}: ChatImageAttachmentInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function clearSelection() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
    setPreview(null);
    setError(null);
    onSelectionChange?.(false);
  }

  useEffect(() => {
    clearSelection();
    // Reset is driven only by the parent after a successful send or chat switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  function selectFile(file: File | null) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      || file.size <= 0
      || file.size > CHAT_IMAGE_MAX_INPUT_BYTES
    ) {
      clearSelection();
      setError(labels.imageRequirements);
      return;
    }

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setPreview({ name: file.name, url });
    setError(null);
    onSelectionChange?.(true);
  }

  return (
    <div className={compact ? "chat-image-input is-compact" : "chat-image-input"}>
      <input
        ref={inputRef}
        type="file"
        name="image"
        accept={CHAT_IMAGE_ACCEPT}
        hidden
        onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
      />
      {preview ? (
        <div className="chat-image-preview">
          <img src={preview.url} alt="" />
          <span>{preview.name}</span>
          <button
            type="button"
            className="icon-button secondary"
            title={labels.removeImage}
            aria-label={labels.removeImage}
            onClick={clearSelection}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="secondary chat-image-choose"
          title={labels.imageRequirements}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus size={15} aria-hidden="true" />
          <span>{labels.attachImage}</span>
        </button>
      )}
      {error && <p className="chat-image-input-error" role="alert">{error}</p>}
    </div>
  );
}
