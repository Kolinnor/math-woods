export function unlockDate(startedAt: Date): Date {
  return new Date(startedAt.getTime());
}

export function discussionIsUnlocked(_unlockAt: Date, _now = new Date()): boolean {
  return true;
}

export function formatUnlockDistance(unlockAt: Date, now = new Date()): string {
  const remainingMs = Math.max(0, unlockAt.getTime() - now.getTime());
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.ceil((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  if (hours <= 0) return `${minutes} min`;
  return `${hours} h ${minutes.toString().padStart(2, "0")}`;
}
