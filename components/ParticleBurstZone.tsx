"use client";

import { useRef, type MouseEvent, type ReactNode } from "react";
import { triggerParticleBurst, type ParticleKind } from "@/lib/particle-burst";

const COOLDOWN_MS = 5000;

export function ParticleBurstZone({
  active,
  children,
  kind
}: {
  active: boolean;
  children: ReactNode;
  kind: ParticleKind;
}) {
  const lastBurstAt = useRef(0);

  return (
    <span
      className="mw-particle-burst-zone"
      onClickCapture={(event: MouseEvent<HTMLSpanElement>) => {
        if (!active) return;
        const now = Date.now();
        if (now - lastBurstAt.current < COOLDOWN_MS) return;
        lastBurstAt.current = now;
        triggerParticleBurst(event.clientX, event.clientY, kind);
      }}
    >
      {children}
    </span>
  );
}
