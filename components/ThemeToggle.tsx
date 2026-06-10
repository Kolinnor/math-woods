"use client";

import { Moon, Sun, Sunset } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dim" | "dark";
const themes: Theme[] = ["light", "dim", "dark"];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "dark" || current === "dim" ? current : "light");
  }, []);

  function toggleTheme() {
    const next = themes[(themes.indexOf(theme) + 1) % themes.length];
    document.documentElement.dataset.theme = next;
    localStorage.setItem("math-woods-theme", next);
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
