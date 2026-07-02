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
