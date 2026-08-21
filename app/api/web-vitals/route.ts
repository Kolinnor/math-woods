import { NextResponse } from "next/server";
import {
  recordWebVital,
  WEB_VITAL_DEVICES,
  WEB_VITAL_NAMES,
  WEB_VITAL_RATINGS,
  type WebVitalDevice,
  type WebVitalName,
  type WebVitalRating
} from "@/lib/observability-metrics";
import { normalizedObservabilityRoute } from "@/lib/observability-routes";
import { assertRateLimit } from "@/lib/rate-limit";
import { clientAddressFromHeaders } from "@/lib/request-security";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 800;

function allowed<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && choices.includes(value as T);
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  try {
    await assertRateLimit(
      `web-vitals:${clientAddressFromHeaders(request.headers)}`,
      120,
      60_000
    );
  } catch {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let data: Record<string, unknown>;
  try {
    const parsed = await request.json();
    data = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const name = data.name;
  const rating = data.rating;
  const device = data.device;
  const value = Number(data.value);
  if (
    !allowed(name, WEB_VITAL_NAMES) ||
    !allowed(rating, WEB_VITAL_RATINGS) ||
    !allowed(device, WEB_VITAL_DEVICES) ||
    !Number.isFinite(value) ||
    value < 0 ||
    (name === "CLS" ? value > 10 : value > 120_000)
  ) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  recordWebVital({
    name: name as WebVitalName,
    rating: rating as WebVitalRating,
    device: device as WebVitalDevice,
    route: normalizedObservabilityRoute(String(data.route ?? "/")),
    value
  });
  return NextResponse.json({ ok: true });
}
