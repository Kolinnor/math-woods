import { notFound, redirect } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { updateProfileAction } from "@/lib/actions/user-actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTranslations } from "@/lib/i18n/server";
import { MATH_LEVEL_OPTIONS } from "@/lib/math-levels";
import { PROBLEM_DOMAIN_HERO_ART } from "@/lib/problem-hero-art";
import { DISPLAY_NAME_MAX_LENGTH, displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";
const SOCIAL_HERO_ART = PROBLEM_DOMAIN_HERO_ART["linear-algebra"];

export default async function EditProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const currentUser = await requireUser();
  const t = await getTranslations();
  const { username } = await params;

  if (currentUser.username !== username) redirect(`/profile/${username}`);

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) notFound();

  return (
    <ForestPageLayout
      title={t.profile.editProfile}
      eyebrow={displayNameForUser(user)}
      heroImage={SOCIAL_HERO_ART.src}
      heroAlt={SOCIAL_HERO_ART.alt}
      description={t.profile.editDescription}
      workspaceClassName="forest-page-workspace-narrow"
    >
      <form action={updateProfileAction} className="panel grid gap-4 p-5">
        <label className="grid gap-2">
          <span className="text-sm font-medium">{t.auth.profileName}</span>
          <input
            name="displayName"
            defaultValue={displayNameForUser(user)}
            minLength={2}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            required
          />
          <small className="muted">
            {t.profile.profileNameUrlHelp(user.username)}
          </small>
        </label>
        <label className="grid gap-2">
          <span className="field-label-with-help text-sm font-medium">
            {t.profile.mathLevelQuestion}
            <span className="help-link" tabIndex={0} title={t.auth.mathLevelHelp} aria-label={t.auth.mathLevelHelp}>
              ?
            </span>
          </span>
          <select name="mathLevel" defaultValue={user.mathLevel ?? ""}>
            <option value="">{t.profile.notSet}</option>
            {MATH_LEVEL_OPTIONS.map((level) => (
              <option key={level.value} value={level.value}>
                {t.auth.mathLevels[level.value]} ({t.auth.mathLevelRange(level.range)})
              </option>
            ))}
          </select>
          <small className="muted">{t.auth.mathLevelHelp}</small>
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">{t.profile.bio}</span>
          <textarea name="bio" defaultValue={user.bio ?? ""} placeholder={t.profile.bioPlaceholder} />
        </label>
        <button type="submit">{t.profile.saveProfile}</button>
      </form>
    </ForestPageLayout>
  );
}
