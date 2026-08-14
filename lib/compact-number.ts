const COMPACT_NUMBER_TIERS = [
  { divisor: 1_000, suffix: "k" },
  { divisor: 1_000_000, suffix: "M" },
  { divisor: 1_000_000_000, suffix: "B" },
  { divisor: 1_000_000_000_000, suffix: "T" }
] as const;

export function formatCompactNumber(value: number) {
  if (!Number.isFinite(value)) return "0";

  const roundedValue = Math.round(value);
  const absoluteValue = Math.abs(roundedValue);
  if (absoluteValue < 1_000) return String(roundedValue);

  let tierIndex = 0;
  for (let index = 1; index < COMPACT_NUMBER_TIERS.length; index += 1) {
    if (absoluteValue < COMPACT_NUMBER_TIERS[index].divisor) break;
    tierIndex = index;
  }

  let scaled = roundedValue / COMPACT_NUMBER_TIERS[tierIndex].divisor;
  let compactValue = Math.round(scaled * 10) / 10;
  if (Math.abs(compactValue) >= 1_000 && tierIndex < COMPACT_NUMBER_TIERS.length - 1) {
    tierIndex += 1;
    scaled = roundedValue / COMPACT_NUMBER_TIERS[tierIndex].divisor;
    compactValue = Math.round(scaled * 10) / 10;
  }

  return `${compactValue}${COMPACT_NUMBER_TIERS[tierIndex].suffix}`;
}
