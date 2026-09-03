"use client";

export type ParticleKind = "confetti" | "heart" | "thumb";

type BurstKind = "heart" | "thumb";

const PARTICLE_COUNT: Record<BurstKind, number> = {
  heart: 9,
  thumb: 9
};

const FIREWORK_SPARK_COUNT = 22;

const FIREWORK_COLORS = ["#ffd97d", "#ff9f43", "#ff6b6b", "#ffe66d", "#4a90ff", "#5ec8ff", "#ffffff"];

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function spawnBurst(x: number, y: number, kind: BurstKind) {
  const count = PARTICLE_COUNT[kind];
  const burst = document.createElement("div");
  burst.className = "mw-particle-burst";
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;

  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement("span");
    particle.className = `mw-particle mw-particle-${kind}`;
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.6;
    const distance = 34 + Math.random() * 32;
    particle.style.setProperty("--mw-particle-dx", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--mw-particle-dy", `${Math.sin(angle) * distance - 18}px`);
    particle.style.setProperty("--mw-particle-delay", `${Math.random() * 70}ms`);
    particle.textContent = kind === "heart" ? "♥" : "\u{1F44D}";
    burst.appendChild(particle);
  }

  document.body.appendChild(burst);
  window.setTimeout(() => burst.remove(), 1000);
}

function spawnFirework(x: number, y: number) {
  const burst = document.createElement("div");
  burst.className = "mw-firework-burst";
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;

  for (let index = 0; index < FIREWORK_SPARK_COUNT; index += 1) {
    const spark = document.createElement("span");
    spark.className = "mw-firework-spark";
    const angleDeg = (360 * index) / FIREWORK_SPARK_COUNT + Math.random() * 10;
    const distance = 32 + Math.random() * 32;
    spark.style.setProperty("--mw-spark-angle", `${angleDeg}deg`);
    spark.style.setProperty("--mw-spark-distance", `${distance}px`);
    spark.style.setProperty("--mw-spark-color", FIREWORK_COLORS[index % FIREWORK_COLORS.length]);
    spark.style.animationDelay = `${Math.random() * 40}ms`;
    burst.appendChild(spark);
  }

  document.body.appendChild(burst);
  window.setTimeout(() => burst.remove(), 750);
}

export function triggerParticleBurst(x: number, y: number, kind: ParticleKind) {
  if (typeof document === "undefined" || prefersReducedMotion()) return;

  if (kind === "confetti") {
    spawnFirework(x, y);
    return;
  }
  spawnBurst(x, y, kind);
}
