"use client";

import { useRef, useState } from "react";
import { imageUploadNetworkError, imageUploadResponseError } from "@/lib/image-upload-errors";
import { DEFAULT_PORTRAIT_CROP, portraitCrop, portraitDetails, portraitImageStyle, type PortraitCrop } from "@/lib/portrait";

export type PortraitValues = { portraitUrl?: string | null; portraitCrop?: unknown; portraitDetails?: string | null; imageAlt?: string | null; imageCredit?: string | null; imageCreditUrl?: string | null; imageLicense?: string | null };

export function PortraitFields({ locale, values, onBusyChange }: { locale: "fr" | "en"; values: PortraitValues; onBusyChange?: (busy: boolean) => void }) {
  const fr = locale === "fr";
  const [url, setUrl] = useState(values.portraitUrl ?? "");
  const [crop, setCrop] = useState(() => portraitCrop(values.portraitCrop));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; crop: PortraitCrop; overflowX: number; overflowY: number } | null>(null);
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  function changeUrl(next: string) { setUrl(next); setCrop(DEFAULT_PORTRAIT_CROP); setLoaded(false); setFailed(false); }
  async function upload(file: File) {
    setBusy(true); onBusyChange?.(true); setMessage(fr ? "Téléversement…" : "Uploading…");
    try {
      const data = new FormData(); data.set("image", file);
      const response = await fetch("/api/images/upload", { method: "POST", body: data });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(imageUploadResponseError(response.status, result));
      if (!result?.image?.publicUrl) throw new Error(fr ? "Le portrait n’a pas pu être téléversé." : "The portrait could not be uploaded.");
      changeUrl(result.image.publicUrl); setMessage("");
    } catch (error) { setMessage(imageUploadNetworkError(error)); }
    finally { setBusy(false); onBusyChange?.(false); if (fileInput.current) fileInput.current.value = ""; }
  }
  return <section className="library-portrait-editor" aria-label={fr ? "Portrait et cadrage" : "Portrait and framing"}>
    <label><span>Portrait</span><input name="imageUrl" value={url} disabled={busy} onChange={e => changeUrl(e.target.value)} placeholder={fr ? "Lien vers l’image" : "Image URL"} /></label>
    <input name="portraitCrop" type="hidden" value={JSON.stringify(crop)} />
    {/* Preserve existing accessibility text and structured attribution from older forms. */}
    <input name="imageAlt" type="hidden" value={values.imageAlt ?? ""} />
    <input name="imageCredit" type="hidden" value={values.imageCredit ?? ""} />
    <input name="imageCreditUrl" type="hidden" value={values.imageCreditUrl ?? ""} />
    <input name="imageLicense" type="hidden" value={values.imageLicense ?? ""} />
    <input ref={fileInput} type="file" accept="image/avif,image/jpeg,image/png,image/webp" hidden onChange={e => { if (e.target.files?.[0]) void upload(e.target.files[0]); }} />
    <div className="library-image-upload-actions">
      <button type="button" className="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>{fr ? "Téléverser un portrait" : "Upload a portrait"}</button>
      {url && <button type="button" className="secondary" disabled={busy} onClick={() => changeUrl("")}>{fr ? "Retirer" : "Remove"}</button>}
    </div>
    {message && <p role="status">{message}</p>}
    <div className="library-portrait-workspace">
      <div>
        <div className="library-portrait-crop" tabIndex={loaded ? 0 : undefined} role="group" aria-label={fr ? "Cadrage du portrait : déplacez l’image ou utilisez les flèches du clavier" : "Portrait framing: drag the image or use the arrow keys"}
          onPointerDown={e => {
            if (!loaded || !image.current || e.button !== 0) return;
            const box = e.currentTarget.getBoundingClientRect(); const img = image.current;
            const scale = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight) * crop.zoom;
            drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, crop, overflowX: img.naturalWidth * scale - box.width, overflowY: img.naturalHeight * scale - box.height };
            e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.focus();
          }}
          onPointerMove={e => { const d = drag.current; if (!d || d.id !== e.pointerId) return; setCrop({ ...d.crop, x: d.overflowX > 0.01 ? clamp(d.crop.x - (e.clientX - d.x) / d.overflowX * 100) : d.crop.x, y: d.overflowY > 0.01 ? clamp(d.crop.y - (e.clientY - d.y) / d.overflowY * 100) : d.crop.y }); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
          onKeyDown={e => { const moves: Record<string, [number, number]> = { ArrowLeft: [2, 0], ArrowRight: [-2, 0], ArrowUp: [0, 2], ArrowDown: [0, -2] }; const move = moves[e.key]; if (move) { e.preventDefault(); setCrop(c => ({ ...c, x: clamp(c.x + move[0]), y: clamp(c.y + move[1]) })); } }}>
          {url && !failed ? <img key={url} ref={image} src={url} alt={fr ? "Aperçu du portrait" : "Portrait preview"} draggable={false} style={portraitImageStyle(crop)} onLoad={() => setLoaded(true)} onError={() => { setFailed(true); setLoaded(false); }} /> : <span>{failed ? (fr ? "Impossible de charger ce portrait. Vérifiez le lien." : "Unable to load this portrait. Check the URL.") : (fr ? "Aperçu du portrait" : "Portrait preview")}</span>}
        </div>
        {loaded && <div className="library-portrait-crop-controls">
          <p>{fr ? "Déplacez l’image pour la recadrer." : "Drag the image to reframe it."}</p>
          <label><span>Zoom</span><input type="range" min="1" max="3" step="0.01" value={crop.zoom} onChange={e => setCrop(c => ({ ...c, zoom: Number(e.target.value) }))} /></label>
          <button type="button" className="secondary" onClick={() => setCrop(DEFAULT_PORTRAIT_CROP)}>{fr ? "Réinitialiser" : "Reset"}</button>
        </div>}
      </div>
      <details className="library-portrait-details"><summary>{fr ? "Détails sur le portrait" : "Portrait details"}</summary>
        <label><span className="sr-only">{fr ? "Source, crédit et licence" : "Source, credit and license"}</span><textarea name="portraitDetails" rows={4} maxLength={4000} defaultValue={portraitDetails(values)} placeholder={fr ? "Source, auteur, lien, licence…" : "Source, creator, URL, license…"} /></label>
      </details>
    </div>
  </section>;
}
