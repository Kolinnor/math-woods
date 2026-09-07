import { portraitImageStyle } from "@/lib/portrait";

export function PortraitImage({ src, alt, crop }: { src: string; alt: string; crop?: unknown }) {
  return <div className="library-portrait-frame"><img src={src} alt={alt} style={portraitImageStyle(crop)} /></div>;
}
