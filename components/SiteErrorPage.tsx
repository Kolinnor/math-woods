"use client";

import { Home, RotateCcw, Search } from "lucide-react";
import Link from "next/link";

type SiteErrorPageProps = {
  code: string;
  message: string;
  onRetry?: () => void;
  title: string;
};

export function SiteErrorPage({ code, message, onRetry, title }: SiteErrorPageProps) {
  return (
    <section className="forest-page-shell site-error-page" aria-labelledby="site-error-title">
      <img
        src="/art/morning-in-a-pine-forest.jpg"
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
    </section>
  );
}
