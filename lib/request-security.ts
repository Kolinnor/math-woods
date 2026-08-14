import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

type HeaderReader = Pick<Headers, "get">;

export function clientAddressFromHeaders(source: HeaderReader) {
  const forwarded = source.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const realIp = source.get("x-real-ip")?.trim();
  return normalizeClientAddress(forwarded) ?? normalizeClientAddress(realIp) ?? "unknown";
}

export function secretsMatch(candidate: string | null | undefined, expected: string | null | undefined) {
  if (!candidate || !expected) return false;

  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

function normalizeClientAddress(value: string | null | undefined) {
  if (!value) return null;
  const candidate = value.trim();
  if (isIP(candidate)) return candidate.toLowerCase();

  const bracketedIpv6 = candidate.match(/^\[([^\]]+)](?::\d+)?$/)?.[1];
  if (bracketedIpv6 && isIP(bracketedIpv6)) return bracketedIpv6.toLowerCase();

  const ipv4WithPort = candidate.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)?.[1];
  if (ipv4WithPort && isIP(ipv4WithPort)) return ipv4WithPort;
  return null;
}
