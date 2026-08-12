import { cookies } from "next/headers";
import { CONTENT_LANGUAGE_COOKIE, parseActiveContentLanguage } from "@/lib/languages";

export async function getPreferredContentLanguage() {
  const cookieStore = await cookies();
  return parseActiveContentLanguage(cookieStore.get(CONTENT_LANGUAGE_COOKIE)?.value);
}
