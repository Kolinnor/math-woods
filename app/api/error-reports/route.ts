import { NotificationType, Role } from "@prisma/client";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { assertRateLimit } from "@/lib/rate-limit";

const MAX_MESSAGE_LENGTH = 1200;
const MAX_STACK_LENGTH = 8000;
const MAX_PATH_LENGTH = 600;
const MAX_DIGEST_LENGTH = 160;
const MAX_SOURCE_LENGTH = 80;

function cleanString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function clientKey(headerValue: string | null, userId: number | null) {
  if (userId) return `error-report:user:${userId}`;
  const forwarded = headerValue?.split(",")[0]?.trim();
  return `error-report:ip:${forwarded || "unknown"}`;
}

export async function POST(request: Request) {
  const headerStore = await headers();
  const currentUser = await getCurrentUser();
  const rateLimitKey = clientKey(headerStore.get("x-forwarded-for"), currentUser?.id ?? null);

  try {
    await assertRateLimit(rateLimitKey, 20, 5 * 60_000);
  } catch {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const message = cleanString(data.message, MAX_MESSAGE_LENGTH);
  if (!message) return NextResponse.json({ ok: false }, { status: 400 });

  const path = cleanString(data.path, MAX_PATH_LENGTH) ?? "/";
  const source = cleanString(data.source, MAX_SOURCE_LENGTH) ?? "client";
  const stack = cleanString(data.stack, MAX_STACK_LENGTH);
  const digest = cleanString(data.digest, MAX_DIGEST_LENGTH);
  const userAgent = cleanString(headerStore.get("user-agent"), 1000);

  const report = await prisma.errorReport.create({
    data: {
      message,
      stack,
      digest,
      path,
      source,
      userAgent,
      userId: currentUser?.id ?? null
    }
  });

  const admins = await prisma.user.findMany({
    where: { role: { in: [Role.ADMIN, Role.OWNER] } },
    select: { id: true }
  });

  await Promise.all(
    admins.map((admin) =>
      createNotification({
      userId: admin.id,
      actorId: null,
      type: NotificationType.SITE_ERROR_REPORTED,
      title: "Site error reported",
      body: `${source}: ${message.slice(0, 180)}`,
      href: `/moderation#error-report-${report.id}`
      })
    )
  );

  return NextResponse.json({ ok: true });
}
