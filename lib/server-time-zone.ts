import { cookies } from "next/headers";
import { USER_TIME_ZONE_COOKIE, validTimeZone } from "@/lib/date-format";

export async function getRequestTimeZone() {
  const cookieStore = await cookies();
  return validTimeZone(cookieStore.get(USER_TIME_ZONE_COOKIE)?.value);
}
