"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";

export function ZenModeToggle() {
  const [zen, setZen] = useState(false);

  useEffect(() => {
    return () => document.documentElement.classList.remove("zen-mode");
  }, []);

  function toggleZen() {
    const next = !zen;
    document.documentElement.classList.toggle("zen-mode", next);
    setZen(next);
  }

  return (
    <button
      type="button"
      className={zen ? "zen-toggle zen-toggle-active secondary" : "zen-toggle secondary"}
      aria-pressed={zen}
      title={zen ? "Leave zen mode" : "Enter zen mode"}
      onClick={toggleZen}
    >
      {zen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
      <span>{zen ? "Exit zen" : "Zen"}</span>
    </button>
  );
}
