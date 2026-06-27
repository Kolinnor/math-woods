"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { USER_TIME_ZONE_COOKIE } from "@/lib/date-format";

function readCookie(name: string) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string) {
  document.cookie =
    `${name}=${encodeURIComponent(value)}; max-age=31536000; path=/; samesite=lax` +
    (location.protocol === "https:" ? "; secure" : "");
}

export function TimeZoneReporter() {
  const router = useRouter();

  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone || readCookie(USER_TIME_ZONE_COOKIE) === timeZone) return;

    writeCookie(USER_TIME_ZONE_COOKIE, timeZone);
    router.refresh();
  }, [router]);

  return null;
}
