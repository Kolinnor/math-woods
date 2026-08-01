export function pickRandomDifferent<T>(items: T[], previous: T | undefined, random = Math.random) {
  if (items.length === 0) return undefined;

  const candidates = items.length > 1 && previous !== undefined
    ? items.filter((item) => item !== previous)
    : items;

  return candidates[Math.floor(random() * candidates.length)];
}
