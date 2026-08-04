"use client";

import { Home, RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const ERROR_PAGE_ART = [
  { src: "/art/rye.jpg", title: "Rye" },
  { src: "/art/oak-grove.jpg", title: "Oak Grove" },
  { src: "/art/birch-grove.jpg", title: "Birch Grove" },
  { src: "/art/brook-in-the-forest.jpg", title: "Brook in the Forest" },
  { src: "/art/pine-forest.jpg", title: "Pine Forest" },
  { src: "/art/morning-in-a-pine-forest.jpg", title: "Morning in a Pine Forest" }
] as const;

type SiteErrorPageProps = {
  code: string;
  message: string;
  onRetry?: () => void;
  title: string;
};

export function SiteErrorPage({ code, message, onRetry, title }: SiteErrorPageProps) {
  const [artIndex, setArtIndex] = useState(0);

  useEffect(() => {
    const randomValue = new Uint32Array(1);
    crypto.getRandomValues(randomValue);
    setArtIndex(randomValue[0] % ERROR_PAGE_ART.length);
  }, []);

  const art = ERROR_PAGE_ART[artIndex];

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
        <p className="site-error-page-kicker">{code}</p>
        <h1 id="site-error-title">{title}</h1>
        <p className="site-error-page-message">{message}</p>
        <div className="site-error-page-actions">
          {onRetry ? (
            <button type="button" onClick={onRetry}>
              <RotateCcw aria-hidden="true" size={18} />
              Try again
            </button>
          ) : (
            <Link href="/problems" className="button">
              <Search aria-hidden="true" size={18} />
              Browse problems
            </Link>
          )}
          <Link href="/" className="button secondary">
            <Home aria-hidden="true" size={18} />
            Back home
          </Link>
        </div>
      </div>
      <p className="site-error-page-credit">
        <cite>{art.title}</cite>, Ivan Shishkin · public domain via{" "}
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
