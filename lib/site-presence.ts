import "server-only";

import { createHash } from "node:crypto";
import { executeRedisCommand } from "@/lib/rate-limit";
import { SITE_PRESENCE_WINDOW_MS, isSitePresenceId, sitePresenceIsActive } from "@/lib/site-presence-config";

const PRESENCE_KEY = "math-woods:presence:active-browsers";
const PRESENCE_TTL_MS = SITE_PRESENCE_WINDOW_MS * 3;
const localPresence = new Map<string, number>();
const RECORD_PRESENCE_SCRIPT = `
redis.call("ZADD", KEYS[1], ARGV[1], ARGV[2])
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[3])
redis.call("PEXPIRE", KEYS[1], ARGV[4])
return redis.call("ZCARD", KEYS[1])
`.trim();
const COUNT_PRESENCE_SCRIPT = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])
return redis.call("ZCARD", KEYS[1])
`.trim();

let redisWarningShown = false;

export async function recordSitePresence(presenceId: string) {
  if (!isSitePresenceId(presenceId)) return;

  const now = Date.now();
  const member = presenceMember(presenceId);
  const redisUrl = sitePresenceRedisUrl();

  if (redisUrl) {
    try {
      await executeRedisCommand(redisUrl, [
        "EVAL",
        RECORD_PRESENCE_SCRIPT,
        "1",
        PRESENCE_KEY,
        String(now),
        member,
        String(now - SITE_PRESENCE_WINDOW_MS),
        String(PRESENCE_TTL_MS)
      ]);
      return;
    } catch {
      warnAboutRedisFallback();
    }
  }

  pruneLocalPresence(now);
  localPresence.set(member, now);
}

export async function activeSitePresenceCount() {
  const now = Date.now();
  const redisUrl = sitePresenceRedisUrl();

  if (redisUrl) {
    try {
      const result = await executeRedisCommand(redisUrl, [
        "EVAL",
        COUNT_PRESENCE_SCRIPT,
        "1",
        PRESENCE_KEY,
        String(now - SITE_PRESENCE_WINDOW_MS)
      ]);
      if (typeof result !== "number") throw new Error("Unexpected Redis presence response.");
      return result;
    } catch {
      warnAboutRedisFallback();
    }
  }

  pruneLocalPresence(now);
  return localPresence.size;
}

function presenceMember(presenceId: string) {
  return createHash("sha256").update(presenceId).digest("hex");
}

function sitePresenceRedisUrl() {
  return process.env.PRESENCE_REDIS_URL?.trim() || process.env.RATE_LIMIT_REDIS_URL?.trim() || null;
}

function pruneLocalPresence(now: number) {
  for (const [member, lastSeenAt] of localPresence) {
    if (!sitePresenceIsActive(lastSeenAt, now)) localPresence.delete(member);
  }
}

function warnAboutRedisFallback() {
  if (redisWarningShown) return;
  redisWarningShown = true;
  console.warn("Site presence could not reach Redis/Valkey. Falling back to process memory.");
}
