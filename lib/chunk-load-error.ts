export const CLIENT_BUNDLE_RELOAD_COOLDOWN_MS = 60_000;

export function chunkLoadErrorMessage(error: Error | null | undefined) {
  return [error?.name, error?.message, error?.stack].filter(Boolean).join("\n");
}

export function isChunkLoadError(error: Error | null | undefined) {
  const message = chunkLoadErrorMessage(error);
  return /ChunkLoadError|Loading chunk \d+ failed|_next\/static\/chunks\//i.test(message);
}

export function chunkLoadErrorSignature(error: Error | null | undefined) {
  const message = chunkLoadErrorMessage(error);
  const chunkUrl = message.match(/https?:\/\/[^\s)]+\/_next\/static\/chunks\/[^\s)]+\.js/i)?.[0];
  const chunkId = message.match(/Loading chunk (\d+) failed/i)?.[1];
  return chunkUrl ?? (chunkId ? `chunk-${chunkId}` : "unknown-chunk");
}

export function isClientBundleError(error: Error | null | undefined) {
  if (isChunkLoadError(error)) return true;

  const message = chunkLoadErrorMessage(error);
  return /\b[a-z_$][\w$]*\[[a-z_$][\w$]*\] is not a function\b/i.test(message);
}

export function clientBundleErrorSignature(error: Error | null | undefined) {
  const chunkSignature = chunkLoadErrorSignature(error);
  return chunkSignature === "unknown-chunk" ? "module-runtime-mismatch" : chunkSignature;
}

export function shouldReloadForClientBundleError(
  error: Error | null | undefined,
  previousReloadedAt: string | null,
  now = Date.now()
) {
  if (!isClientBundleError(error)) return false;

  const previousTimestamp = Number(previousReloadedAt);
  return (
    !previousReloadedAt
    || !Number.isFinite(previousTimestamp)
    || now - previousTimestamp >= CLIENT_BUNDLE_RELOAD_COOLDOWN_MS
  );
}
