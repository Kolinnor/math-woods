"use client";

import { Home, RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const ERROR_PAGE_ART = [
  { src: "/art/rye.jpg", title: "Rye", titleFr: "Seigle" },
  { src: "/art/oak-grove.jpg", title: "Oak Grove", titleFr: "Bosquet de chênes" },
  { src: "/art/birch-grove.jpg", title: "Birch Grove", titleFr: "Bosquet de bouleaux" },
  { src: "/art/brook-in-the-forest.jpg", title: "Brook in the Forest", titleFr: "Ruisseau dans la forêt" },
  { src: "/art/pine-forest.jpg", title: "Pine Forest", titleFr: "Forêt de pins" },
  { src: "/art/morning-in-a-pine-forest.jpg", title: "Morning in a Pine Forest", titleFr: "Matin dans une forêt de pins" }
] as const;

type SiteErrorPageProps = {
  code: string;
  french?: {
    code?: string;
    message: string;
    title: string;
  };
  message: string;
  onRetry?: () => void;
  title: string;
};

export function SiteErrorPage({ code, french, message, onRetry, title }: SiteErrorPageProps) {
  const [artIndex, setArtIndex] = useState(0);
  const [isFrench, setIsFrench] = useState(false);

  useEffect(() => {
    const randomValue = new Uint32Array(1);
    crypto.getRandomValues(randomValue);
    setArtIndex(randomValue[0] % ERROR_PAGE_ART.length);
    setIsFrench(
      document.documentElement.lang === "fr" ||
        document.cookie.split(";").some((part) => part.trim() === "math-woods-language=fr")
    );
  }, []);

  const art = ERROR_PAGE_ART[artIndex];
  const shownCode = isFrench ? french?.code ?? code : code;
  const shownTitle = isFrench ? french?.title ?? title : title;
  const shownMessage = isFrench ? french?.message ?? message : message;

  return (
    <section className="forest-page-shell site-error-page" aria-labelledby="site-error-title">
      <img
        src={art.src}
        alt=""
        aria-hidden="true"
        className="site-error-page-art"
      />
      <div className="site-error-page-overlay" />
      <div className="site-error-page-content">
        <p className="site-error-page-kicker">{shownCode}</p>
        <h1 id="site-error-title">{shownTitle}</h1>
        <p className="site-error-page-message">{shownMessage}</p>
        <div className="site-error-page-actions">
          {onRetry ? (
            <button type="button" onClick={onRetry}>
              <RotateCcw aria-hidden="true" size={18} />
              {isFrench ? "Réessayer" : "Try again"}
            </button>
          ) : (
            <Link href="/problems" className="button">
              <Search aria-hidden="true" size={18} />
              {isFrench ? "Parcourir les problèmes" : "Browse problems"}
            </Link>
          )}
          <Link href="/" className="button secondary">
            <Home aria-hidden="true" size={18} />
            {isFrench ? "Retour à l’accueil" : "Back home"}
          </Link>
        </div>
      </div>
      <p className="site-error-page-credit">
        <cite>{isFrench ? art.titleFr : art.title}</cite>, Ivan Shishkin · {isFrench ? "domaine public via" : "public domain via"}{" "}
        <a
          href="https://commons.wikimedia.org/wiki/Category:Ivan_Shishkin"
          target="_blank"
          rel="noopener noreferrer"
        >
          Wikimedia Commons
        </a>
      </p>
    </section>
  );
}
