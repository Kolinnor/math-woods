import { PortraitImage } from "@/components/library/PortraitImage";
import { libraryEraStyle, libraryInitials } from "@/lib/library-display";

/**
 * A portrait when there is one, otherwise a monogram tinted by the person's era, so that a
 * catalogue without many portraits still looks like a gallery rather than a list of gaps.
 */
export function LibraryPersonPortrait({
  name,
  portraitUrl,
  crop,
  alt,
  era,
  variant = "card"
}: {
  name: string;
  portraitUrl?: string | null;
  crop?: unknown;
  alt?: string;
  /** Era of the person, which gives the colour of the monogram. */
  era?: { color: string } | null;
  variant?: "card" | "thumb";
}) {
  if (portraitUrl) return <PortraitImage src={portraitUrl} alt={alt ?? ""} crop={crop} />;
  return (
    <div className={`library-monogram library-monogram-${variant}`} style={libraryEraStyle(era)} role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
      <span>{libraryInitials(name)}</span>
    </div>
  );
}
