import { createHash } from "node:crypto";
import net from "node:net";

type RedisValue = string | number | null | RedisValue[];

const buckets = new Map<string, number[]>();
const occurrenceBuckets = new Map<string, { count: number; expiresAt: number }>();
const REDIS_RATE_LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return current
`.trim();
const REDIS_RATE_LIMIT_ONCE_SCRIPT = `
local existing = redis.call("GET", KEYS[2])
if existing then
  return tonumber(existing)
end
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 1 then
  ttl = tonumber(ARGV[1])
end
redis.call("SET", KEYS[2], tostring(current), "PX", ttl)
return current
`.trim();

let redisWarningShown = false;

export class RateLimitError extends Error {
  constructor() {
    super("Too many requests. Please wait a moment and try again.");
    this.name = "RateLimitError";
  }
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError || (
    error instanceof Error && error.message.startsWith("Too many requests")
  );
}

export async function assertRateLimit(key: string, limit: number, windowMs: number) {
  const storageKey = rateLimitStorageKey(key);
  const redisUrl = process.env.RATE_LIMIT_REDIS_URL?.trim();

  if (redisUrl) {
    try {
      const count = await incrementRedisBucket(redisUrl, storageKey, windowMs);
      if (count > limit) {
        throw new RateLimitError();
      }
      return;
    } catch (error) {
      if (isRateLimitError(error)) throw error;
      if (!redisWarningShown) {
        redisWarningShown = true;
        console.warn("RATE_LIMIT_REDIS_URL is set, but Redis/Valkey rate limiting failed. Falling back to memory.");
      }
    }
  }

  assertMemoryRateLimit(storageKey, limit, windowMs);
}

export async function assertRateLimitOnce(
  key: string,
  occurrenceKey: string,
  limit: number,
  windowMs: number
) {
  const storageKey = rateLimitStorageKey(key);
  const occurrenceStorageKey = rateLimitStorageKey(`${key}:occurrence:${occurrenceKey}`);
  const redisUrl = process.env.RATE_LIMIT_REDIS_URL?.trim();

  if (redisUrl) {
    try {
      const count = await incrementRedisBucketOnce(
        redisUrl,
        storageKey,
        occurrenceStorageKey,
        windowMs
      );
      if (count > limit) throw new RateLimitError();
      return;
    } catch (error) {
      if (isRateLimitError(error)) throw error;
      if (!redisWarningShown) {
        redisWarningShown = true;
        console.warn("RATE_LIMIT_REDIS_URL is set, but Redis/Valkey rate limiting failed. Falling back to memory.");
      }
    }
  }

  assertMemoryRateLimitOnce(storageKey, occurrenceStorageKey, limit, windowMs);
}

function assertMemoryRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const existing = buckets.get(key)?.filter((timestamp) => timestamp > cutoff) ?? [];

  if (existing.length >= limit) {
    throw new RateLimitError();
  }

  existing.push(now);
  buckets.set(key, existing);
}

function assertMemoryRateLimitOnce(
  key: string,
  occurrenceKey: string,
  limit: number,
  windowMs: number
) {
  const now = Date.now();
  const previousOccurrence = occurrenceBuckets.get(occurrenceKey);
  if (previousOccurrence && previousOccurrence.expiresAt > now) {
    if (previousOccurrence.count > limit) throw new RateLimitError();
    return;
  }

  const cutoff = now - windowMs;
  const existing = buckets.get(key)?.filter((timestamp) => timestamp > cutoff) ?? [];
  existing.push(now);
  buckets.set(key, existing);
  occurrenceBuckets.set(occurrenceKey, {
    count: existing.length,
    expiresAt: (existing[0] ?? now) + windowMs
  });

  if (existing.length > limit) throw new RateLimitError();
}

function rateLimitStorageKey(key: string) {
  const digest = createHash("sha256").update(key).digest("hex");
  return `math-woods:rate-limit:${digest}`;
}

async function incrementRedisBucket(redisUrl: string, key: string, windowMs: number): Promise<number> {
  const result = await executeRedisCommand(redisUrl, ["EVAL", REDIS_RATE_LIMIT_SCRIPT, "1", key, String(windowMs)]);
  if (typeof result !== "number") throw new Error("Unexpected Redis rate-limit response.");
  return result;
}

async function incrementRedisBucketOnce(
  redisUrl: string,
  key: string,
  occurrenceKey: string,
  windowMs: number
): Promise<number> {
  const result = await executeRedisCommand(redisUrl, [
    "EVAL",
    REDIS_RATE_LIMIT_ONCE_SCRIPT,
    "2",
    key,
    occurrenceKey,
    String(windowMs)
  ]);
  if (typeof result !== "number") throw new Error("Unexpected Redis rate-limit response.");
  return result;
}

export async function executeRedisCommand(redisUrl: string, parts: string[]): Promise<RedisValue> {
  const url = new URL(redisUrl);
  if (url.protocol !== "redis:") throw new Error("Only redis:// URLs are supported for RATE_LIMIT_REDIS_URL.");

  const socket = await connectRedis(url);
  try {
    if (url.password) {
      const username = decodeURIComponent(url.username);
      const password = decodeURIComponent(url.password);
      await sendRedisCommand(socket, username ? ["AUTH", username, password] : ["AUTH", password]);
    }

    const database = Number(url.pathname.replace("/", ""));
    if (Number.isInteger(database) && database > 0) {
      await sendRedisCommand(socket, ["SELECT", String(database)]);
    }

    return await sendRedisCommand(socket, parts);
  } finally {
    socket.destroy();
  }
}

function connectRedis(url: URL): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: url.hostname,
      port: Number(url.port || 6379)
    });
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
    socket.setTimeout(1500, () => {
      socket.destroy(new Error("Redis connection timed out."));
    });
  });
}

function sendRedisCommand(socket: net.Socket, parts: string[]): Promise<RedisValue> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);

    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        const parsed = parseRedisValue(buffer);
        if (!parsed) return;
        cleanup();
        resolve(parsed.value);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };

    socket.on("data", onData);
    socket.on("error", onError);
    socket.write(encodeRedisCommand(parts));
  });
}

function encodeRedisCommand(parts: string[]) {
  return `*${parts.length}\r\n${parts
    .map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`)
    .join("")}`;
}

function parseRedisValue(buffer: Buffer, offset = 0): { value: RedisValue; offset: number } | null {
  const type = String.fromCharCode(buffer[offset]);
  if (!type) return null;

  if (type === "+" || type === "-" || type === ":") {
    const end = buffer.indexOf("\r\n", offset);
    if (end === -1) return null;
    const raw = buffer.toString("utf8", offset + 1, end);
    if (type === "-") throw new Error(raw);
    return { value: type === ":" ? Number(raw) : raw, offset: end + 2 };
  }

  if (type === "$") {
    const end = buffer.indexOf("\r\n", offset);
    if (end === -1) return null;
    const length = Number(buffer.toString("utf8", offset + 1, end));
    if (length === -1) return { value: null, offset: end + 2 };
    const valueStart = end + 2;
    const valueEnd = valueStart + length;
    if (buffer.length < valueEnd + 2) return null;
    return { value: buffer.toString("utf8", valueStart, valueEnd), offset: valueEnd + 2 };
  }

  if (type === "*") {
    const end = buffer.indexOf("\r\n", offset);
    if (end === -1) return null;
    const length = Number(buffer.toString("utf8", offset + 1, end));
    const values: RedisValue[] = [];
    let cursor = end + 2;

    for (let index = 0; index < length; index += 1) {
      const parsed = parseRedisValue(buffer, cursor);
      if (!parsed) return null;
      values.push(parsed.value);
      cursor = parsed.offset;
    }

    return { value: values, offset: cursor };
  }

  throw new Error(`Unsupported Redis response type: ${type}`);
}
