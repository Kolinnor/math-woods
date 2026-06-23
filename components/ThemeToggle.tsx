"use client";

import { Moon, Sun, Sunset } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dim" | "dark";
const themes: Theme[] = ["light", "dim", "dark"];

function persistAppearanceCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=31536000; path=/; samesite=lax${
    window.location.protocol === "https:" ? "; secure" : ""
  }`;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    function syncTheme() {
      const stored = localStorage.getItem("math-woods-theme");
      const current = stored || document.documentElement.dataset.theme;
      const next = current === "dark" || current === "dim" ? current : "light";
      document.documentElement.dataset.theme = next;
      persistAppearanceCookie("math-woods-theme", next);
      setTheme(next);
    }

    syncTheme();
    window.addEventListener("storage", syncTheme);
    window.addEventListener("pageshow", syncTheme);
    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener("pageshow", syncTheme);
    };
  }, []);

  function toggleTheme() {
    const next = themes[(themes.indexOf(theme) + 1) % themes.length];
    document.documentElement.dataset.theme = next;
    localStorage.setItem("math-woods-theme", next);
    persistAppearanceCookie("math-woods-theme", next);
    localStorage.removeItem("math-hills-theme");
    localStorage.removeItem("math-garden-theme");
    setTheme(next);
  }

  const nextTheme = themes[(themes.indexOf(theme) + 1) % themes.length];

  return (
    <button
      type="button"
      className="icon-button secondary"
      aria-label={`Use ${nextTheme} theme`}
      title={`Use ${nextTheme} theme`}
      onClick={toggleTheme}
    >
      {theme === "light" ? <Sun size={17} /> : theme === "dim" ? <Sunset size={17} /> : <Moon size={17} />}
    </button>
  );
}
