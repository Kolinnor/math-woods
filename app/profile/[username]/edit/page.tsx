import { notFound, redirect } from "next/navigation";
import { AvatarUploader } from "@/components/AvatarUploader";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { updateProfileAction } from "@/lib/actions/user-actions";
import { DEFAULT_AVATAR_PRESETS, type DefaultAvatarPreset } from "@/lib/avatar-presets";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTranslations } from "@/lib/i18n/server";
import { MATH_LEVEL_OPTIONS } from "@/lib/math-levels";
import { PROBLEM_DOMAIN_HERO_ART } from "@/lib/problem-hero-art";
import { DISPLAY_NAME_MAX_LENGTH, displayNameForUser } from "@/lib/user-display";
import { normalizeUsernameLookup, profilePath, publicProfileLookupWhere } from "@/lib/usernames";
import { USER_DISCOVERY_SOURCES } from "@/lib/user-discovery-source";

export const dynamic = "force-dynamic";
const SOCIAL_HERO_ART = PROBLEM_DOMAIN_HERO_ART["linear-algebra"];

export default async function EditProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const currentUser = await requireUser();
  const t = await getTranslations();
  const { username } = await params;

  const user = await prisma.user.findFirst({
    where: publicProfileLookupWhere(username)
  });
  if (!user) notFound();
  if (currentUser.id !== user.id) redirect(profilePath(user));
  if (normalizeUsernameLookup(username) !== normalizeUsernameLookup(user.profileSlug)) {
    redirect(profilePath(user, "/edit"));
  }
  const avatarPresetLabels = Object.fromEntries(
    DEFAULT_AVATAR_PRESETS.map((preset) => [preset, t.profile.profileImagePresetLabel(preset)])
  ) as Record<DefaultAvatarPreset, string>;

  return (
    <ForestPageLayout
      title={t.profile.editProfile}
      eyebrow={displayNameForUser(user)}
      heroImage={SOCIAL_HERO_ART.src}
      heroAlt={SOCIAL_HERO_ART.alt}
      workspaceClassName="forest-page-workspace-narrow"
    >
      <AvatarUploader
        initialAvatarBackground={user.avatarBackground}
        initialAvatarUrl={user.avatarUrl}
        user={{ username: user.username, displayName: user.displayName }}
        labels={{
          backgroundColors: t.profile.profileImageBackgroundColors,
          backgroundTitle: t.profile.profileImageBackground,
          backgroundUpdated: t.profile.profileImageBackgroundUpdated,
          choose: t.profile.chooseProfileImage,
          defaultFailed: t.profile.profileImageDefaultFailed,
          defaultOption: t.profile.profileImageDefaultOption,
          defaultTitle: t.profile.profileImageDefault,
          defaultUpdated: t.profile.profileImageDefaultUpdated,
          help: t.profile.profileImageHelp,
          invalid: t.profile.profileImageInvalid,
          presetLabels: avatarPresetLabels,
          remove: t.profile.removeProfileImage,
          removed: t.profile.profileImageRemoved,
          title: t.profile.profileImage,
          uploadHelp: t.profile.profileImageUploadHelp,
          uploadFailed: t.profile.profileImageUploadFailed,
          uploadOption: t.profile.profileImageUploadOption,
          uploading: t.profile.profileImageUploading,
          uploaded: t.profile.profileImageUploaded
        }}
      />
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
        <label className="grid gap-2">
          <span className="text-sm font-medium">{t.profile.discoverySourceQuestion}</span>
          <select name="discoverySource" required defaultValue={user.discoverySource ?? ""}>
            <option value="" disabled>{t.profile.discoverySourcePlaceholder}</option>
            {USER_DISCOVERY_SOURCES.map((source) => (
              <option key={source} value={source}>{t.profile.discoverySources[source]}</option>
            ))}
          </select>
          <small className="muted">{t.profile.discoverySourceHelp}</small>
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">{t.profile.discoverySourceDetail}</span>
          <input
            name="discoverySourceDetail"
            defaultValue={user.discoverySourceDetail ?? ""}
            maxLength={240}
            placeholder={t.profile.discoverySourceDetailPlaceholder}
          />
        </label>
        <button type="submit">{t.profile.saveProfile}</button>
      </form>
    </ForestPageLayout>
  );
}
