"use client";

import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";
import { imageUploadNetworkError, imageUploadResponseError } from "@/lib/image-upload-errors";
import {
  KNOWN_PROBLEM_SOURCE_ICON_SIZE,
  parseKnownProblemSourceIconSize
} from "@/lib/known-problem-sources";

type UploadResponse = {
  image?: { publicUrl?: string };
  error?: string;
};

export function KnownProblemSourceFields({
  initialName,
  initialAliases,
  initialValue,
  initialIconSize,
  locale
}: {
  initialName?: string;
  initialAliases?: string;
  initialValue?: string | null;
  initialIconSize?: number;
  locale: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sourceName, setSourceName] = useState(initialName ?? "");
  const [iconUrl, setIconUrl] = useState(initialValue ?? "");
  const [iconSize, setIconSize] = useState(parseKnownProblemSourceIconSize(initialIconSize));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fr = locale === "fr";

  async function upload(file: File) {
    setBusy(true);
    setMessage(fr ? "Téléversement…" : "Uploading…");
    try {
      const formData = new FormData();
      formData.set("image", file);
      const response = await fetch("/api/images/upload", { method: "POST", body: formData });
      const result = await response.json().catch(() => null) as UploadResponse | null;
      if (!response.ok) throw new Error(imageUploadResponseError(response.status, result));
      const publicUrl = result?.image?.publicUrl;
      if (!publicUrl) throw new Error("The upload service did not return an image URL.");
      setIconUrl(publicUrl);
      setMessage(fr ? "Pictogramme téléversé. Enregistrez la source pour le conserver." : "Pictogram uploaded. Save the source to keep it.");
    } catch (error) {
      setMessage(imageUploadNetworkError(error));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <label className="grid gap-2">
        <span className="text-sm font-medium">{fr ? "Nom" : "Name"}</span>
        <input
          name="name"
          required
          maxLength={180}
          value={sourceName}
          onChange={(event) => setSourceName(event.target.value)}
        />
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-medium">{fr ? "Alias" : "Aliases"}</span>
        <textarea
          name="aliases"
          rows={3}
          defaultValue={initialAliases}
          placeholder={fr ? "Un alias par ligne" : "One alias per line"}
        />
      </label>
      <div className="grid gap-2">
        <span className="text-sm font-medium">{fr ? "Pictogramme" : "Pictogram"}</span>
        <div className="flex flex-wrap items-center gap-3">
          {iconUrl && <img src={iconUrl} alt="" className="h-12 w-12 object-contain" />}
          <input
            name="iconUrl"
            value={iconUrl}
            maxLength={1200}
            placeholder="/icons/source.png"
            onChange={(event) => {
              setIconUrl(event.target.value);
              setMessage(null);
            }}
          />
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
            <ImagePlus size={16} aria-hidden="true" />
            {busy ? (fr ? "Téléversement…" : "Uploading…") : (fr ? "Téléverser" : "Upload")}
          </button>
        </div>
        <p className="muted text-sm">
          {fr ? "PNG, WebP, JPEG ou AVIF. Une image carrée et transparente fonctionne le mieux." : "PNG, WebP, JPEG, or AVIF. A square transparent image works best."}
        </p>
        {message && <p className="text-sm" role="status">{message}</p>}
      </div>

      <label className="grid gap-2">
        <span className="flex items-center justify-between gap-3 text-sm font-medium">
          <span>{fr ? "Taille du pictogramme" : "Pictogram size"}</span>
          <output>{iconSize} px</output>
        </span>
        <input
          name="iconSize"
          type="range"
          min={KNOWN_PROBLEM_SOURCE_ICON_SIZE.min}
          max={KNOWN_PROBLEM_SOURCE_ICON_SIZE.max}
          step={2}
          value={iconSize}
          onChange={(event) => setIconSize(parseKnownProblemSourceIconSize(event.target.value))}
        />
      </label>

      <section className="known-problem-source-preview" aria-label={fr ? "Aperçu de la source" : "Source preview"}>
        <p className="muted text-sm font-medium">{fr ? "Aperçu sur une page de problème" : "Preview on a problem page"}</p>
        <div className="problem-origin-note zen-meta" aria-live="polite">
          <strong className="problem-source-heading">{fr ? "Source" : "Source"}</strong>
          <div className="problem-source-identities">
            <span className="problem-source-identity">
              {iconUrl && (
                <img
                  src={iconUrl}
                  alt=""
                  className="problem-source-icon"
                  style={{ blockSize: iconSize, flexBasis: iconSize, inlineSize: iconSize }}
                />
              )}
              <span>{sourceName.trim() || (fr ? "Nom de la source" : "Source name")}</span>
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
