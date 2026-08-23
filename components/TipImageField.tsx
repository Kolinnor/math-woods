"use client";

import { ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  DEFAULT_TIP_IMAGE_POSITION,
  DEFAULT_TIP_IMAGE_URL,
  MAX_TIP_IMAGES,
  tipImageObjectPosition
} from "@/lib/tip-images";
import { imageUploadNetworkError, imageUploadResponseError } from "@/lib/image-upload-errors";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const KEYBOARD_POSITION_STEP = 3;
const KEYBOARD_POSITION_MOVEMENT: Partial<Record<string, readonly [number, number]>> = {
  ArrowDown: [0, -KEYBOARD_POSITION_STEP],
  ArrowLeft: [KEYBOARD_POSITION_STEP, 0],
  ArrowRight: [-KEYBOARD_POSITION_STEP, 0],
  ArrowUp: [0, KEYBOARD_POSITION_STEP]
};

type UploadResponse = {
  error?: string;
  image?: {
    publicUrl?: string;
  };
};

type TipImageFieldProps = {
  initialImageUrl: string | null;
  initialPositionX: number;
  initialPositionY: number;
  defaultImageUrl?: string;
  defaultImageLabel?: string;
  inputNames?: {
    imageUrl: string;
    imagePositionX: string;
    imagePositionY: string;
  };
  saveLabel?: string;
  heading?: string;
  onRemove?: () => void;
};

export function TipImageField({
  initialImageUrl,
  initialPositionX,
  initialPositionY,
  defaultImageUrl = DEFAULT_TIP_IMAGE_URL,
  defaultImageLabel = "Oak Grove",
  inputNames = {
    imageUrl: "imageUrl",
    imagePositionX: "imagePositionX",
    imagePositionY: "imagePositionY"
  },
  saveLabel = "Save the tip",
  heading,
  onRemove
}: TipImageFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState(initialImageUrl ?? "");
  const [positionX, setPositionX] = useState(initialPositionX);
  const [positionY, setPositionY] = useState(initialPositionY);
  const dragRef = useRef<{
    pointerId: number;
    pointerX: number;
    pointerY: number;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const effectiveImageUrl = imageUrl.trim() || defaultImageUrl;
  const objectPosition = tipImageObjectPosition(positionX, positionY);

  function clampPosition(position: number) {
    return Math.max(0, Math.min(100, Math.round(position)));
  }

  function startPositioning(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      positionX,
      positionY,
      width: bounds.width,
      height: bounds.height
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function movePosition(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPositionX(clampPosition(drag.positionX - ((event.clientX - drag.pointerX) / drag.width) * 100));
    setPositionY(clampPosition(drag.positionY - ((event.clientY - drag.pointerY) / drag.height) * 100));
  }

  function stopPositioning(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  }

  function movePositionWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    const movement = KEYBOARD_POSITION_MOVEMENT[event.key];
    if (!movement) return;
    event.preventDefault();
    setPositionX((current) => clampPosition(current + movement[0]));
    setPositionY((current) => clampPosition(current + movement[1]));
  }

  async function upload(file: File) {
    if (
      !["image/avif", "image/jpeg", "image/png", "image/webp"].includes(file.type)
      || file.size <= 0
      || file.size > MAX_IMAGE_BYTES
    ) {
      setMessage("Choose an AVIF, JPEG, PNG, or WebP image smaller than 5 MB.");
      return;
    }

    setBusy(true);
    setMessage("Uploading image...");
    try {
      const formData = new FormData();
      formData.set("image", file);
      formData.set("purpose", "tip");
      const response = await fetch("/api/images/upload", { method: "POST", body: formData });
      const result = await response.json().catch(() => null) as UploadResponse | null;
      const publicUrl = result?.image?.publicUrl;
      if (!response.ok) throw new Error(imageUploadResponseError(response.status, result));
      if (!publicUrl) throw new Error("The upload service accepted the image but did not return its public URL.");

      setImageUrl(publicUrl);
      setPreviewFailed(false);
      setMessage(`Image uploaded. ${saveLabel} to keep it.`);
    } catch (error) {
      setMessage(imageUploadNetworkError(error));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section className="tip-image-editor">
      {heading && (
        <div className="tip-image-editor-heading">
          <strong>{heading}</strong>
          {onRemove && (
            <button type="button" className="secondary icon-button" title={`Remove ${heading}`} onClick={onRemove}>
              <Trash2 size={16} aria-hidden="true" />
              <span className="sr-only">Remove {heading}</span>
            </button>
          )}
        </div>
      )}
      <div className="tip-image-previews">
        {!previewFailed ? (
          <figure>
            <figcaption>Desktop and mobile · square</figcaption>
            <div
              className={dragging
                ? "tip-image-preview tip-image-preview-square dragging"
                : "tip-image-preview tip-image-preview-square"}
              role="application"
              tabIndex={0}
              aria-label="Drag or use the arrow keys to reposition the image inside the square crop."
              onKeyDown={movePositionWithKeyboard}
              onPointerDown={startPositioning}
              onPointerMove={movePosition}
              onPointerUp={stopPositioning}
              onPointerCancel={stopPositioning}
            >
              <img
                key={effectiveImageUrl}
                src={effectiveImageUrl}
                alt=""
                draggable={false}
                style={{ objectPosition }}
                onLoad={() => setPreviewFailed(false)}
                onError={() => setPreviewFailed(true)}
              />
              <span className="tip-image-crop-frame" aria-hidden="true" />
            </div>
          </figure>
        ) : (
          <div className="tip-image-preview tip-image-preview-square">
            <p>Preview unavailable. Check the image URL.</p>
          </div>
        )}
      </div>
      <div className="tip-image-controls">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Image</span>
          <input
            name={inputNames.imageUrl}
            value={imageUrl}
            maxLength={1200}
            placeholder={defaultImageUrl}
            onChange={(event) => {
              setImageUrl(event.target.value);
              setPreviewFailed(false);
              setMessage(null);
            }}
          />
        </label>
        <p className="muted text-sm">
          Paste a secure image URL, use a local site path, or upload an image. Leave blank to use {defaultImageLabel}.
        </p>
        <fieldset className="tip-image-crop-controls">
          <legend>Crop</legend>
          <p>Drag or touch the image to position it inside the square.</p>
          <input name={inputNames.imagePositionX} type="hidden" value={positionX} />
          <input name={inputNames.imagePositionY} type="hidden" value={positionY} />
          <button
            type="button"
            className="secondary"
            disabled={positionX === DEFAULT_TIP_IMAGE_POSITION && positionY === DEFAULT_TIP_IMAGE_POSITION}
            onClick={() => {
              setPositionX(DEFAULT_TIP_IMAGE_POSITION);
              setPositionY(DEFAULT_TIP_IMAGE_POSITION);
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Center image
          </button>
        </fieldset>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/avif,image/jpeg,image/png,image/webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <div className="tip-image-actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            <ImagePlus size={16} aria-hidden="true" />
            {busy ? "Uploading..." : "Upload image"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || !imageUrl}
            onClick={() => {
              setImageUrl("");
              setPositionX(DEFAULT_TIP_IMAGE_POSITION);
              setPositionY(DEFAULT_TIP_IMAGE_POSITION);
              setPreviewFailed(false);
              setMessage("The default image will be used after saving.");
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Use default
          </button>
        </div>
        {message && <p className="tip-image-message" role="status">{message}</p>}
      </div>
    </section>
  );
}

export type TipImageFieldValue = {
  id?: number;
  imageUrl: string;
  imagePositionX: number;
  imagePositionY: number;
};

type EditableTipImage = TipImageFieldValue & { clientId: string };

export function TipImageCollectionField({ initialImages }: { initialImages: TipImageFieldValue[] }) {
  const nextId = useRef(initialImages.length);
  const [images, setImages] = useState<EditableTipImage[]>(() =>
    initialImages.map((image, index) => ({
      ...image,
      clientId: image.id ? `saved-${image.id}` : `initial-${index}`
    }))
  );

  function addImage() {
    if (images.length >= MAX_TIP_IMAGES) return;
    const clientId = `new-${nextId.current}`;
    nextId.current += 1;
    setImages((current) => [
      ...current,
      {
        clientId,
        imageUrl: "",
        imagePositionX: DEFAULT_TIP_IMAGE_POSITION,
        imagePositionY: DEFAULT_TIP_IMAGE_POSITION
      }
    ]);
  }

  return (
    <fieldset className="tip-image-collection">
      <legend>Tip images</legend>
      <p className="muted text-sm">
        Add up to {MAX_TIP_IMAGES} square images. Math Woods chooses one for this tip each day and keeps it unchanged until the next day.
      </p>
      {images.length === 0 && (
        <p className="tip-image-empty">No custom image. Oak Grove will be used.</p>
      )}
      <div className="tip-image-collection-list">
        {images.map((image, index) => (
          <TipImageField
            key={image.clientId}
            heading={`Image ${index + 1}`}
            initialImageUrl={image.imageUrl}
            initialPositionX={image.imagePositionX}
            initialPositionY={image.imagePositionY}
            inputNames={{
              imageUrl: "imageUrls",
              imagePositionX: "imagePositionXs",
              imagePositionY: "imagePositionYs"
            }}
            onRemove={() => setImages((current) => current.filter((entry) => entry.clientId !== image.clientId))}
          />
        ))}
      </div>
      <button type="button" className="secondary" disabled={images.length >= MAX_TIP_IMAGES} onClick={addImage}>
        <ImagePlus size={16} aria-hidden="true" />
        Add image
      </button>
    </fieldset>
  );
}
