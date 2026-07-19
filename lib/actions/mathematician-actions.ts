"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText, boundedText } from "@/lib/content-limits";
import { insertHistoricalMathematician } from "@/lib/historical-mathematicians";
import { canUseAdminTools } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { uniqueSlug } from "@/lib/unique-slug";

function normalizePortraitUrl(value: FormDataEntryValue | null) {
  const url = boundedText(value, CONTENT_LIMITS.shortText, "Portrait URL");
  if (!url) return null;
  if (url.startsWith("/")) return url;

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return parsed.toString();
  } catch {
    // The validation error below is more useful than the URL constructor error.
  }

  throw new Error("Portrait URL must be a secure https URL.");
}

export async function createMathematicianAction(formData: FormData) {
  const user = await requireUser();
  if (!canUseAdminTools(user)) throw new Error("Only admins can add mathematicians.");
  await assertRateLimit(`mathematician:${user.id}`, 12, 60_000);

  const name = requiredBoundedText(formData.get("name"), CONTENT_LIMITS.title, "Name");
  const lifespan = requiredBoundedText(formData.get("lifespan"), CONTENT_LIMITS.shortText, "Dates");
  const birthPlace = requiredBoundedText(formData.get("birthPlace"), CONTENT_LIMITS.shortText, "Birthplace");
  const portraitUrl = normalizePortraitUrl(formData.get("portraitUrl"));
  const slug = await uniqueSlug("mathematician", name);

  const mathematician = await insertHistoricalMathematician({
    slug,
    name,
    lifespan,
    birthPlace,
    portraitUrl,
    createdById: user.id
  });

  revalidatePath("/mathematicians");
  redirect(`/mathematicians/${mathematician.slug}`);
}
