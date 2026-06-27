import { cookies } from "next/headers";
import { CONTENT_LANGUAGE_COOKIE, parseContentLanguage } from "@/lib/languages";

export async function getPreferredContentLanguage() {
  const cookieStore = await cookies();
  return parseContentLanguage(cookieStore.get(CONTENT_LANGUAGE_COOKIE)?.value);
}
