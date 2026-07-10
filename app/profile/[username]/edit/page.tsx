import { notFound, redirect } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { updateProfileAction } from "@/lib/actions/user-actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MATH_LEVEL_HELP_TEXT, MATH_LEVEL_OPTIONS } from "@/lib/math-levels";
import { PROBLEM_DOMAIN_HERO_ART } from "@/lib/problem-hero-art";
import { DISPLAY_NAME_MAX_LENGTH, displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";
const SOCIAL_HERO_ART = PROBLEM_DOMAIN_HERO_ART["linear-algebra"];

export default async function EditProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const currentUser = await requireUser();
  const { username } = await params;

  if (currentUser.username !== username) redirect(`/profile/${username}`);

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) notFound();

  return (
    <ForestPageLayout
      title="Edit profile"
      eyebrow={displayNameForUser(user)}
      heroImage={SOCIAL_HERO_ART.src}
      heroAlt={SOCIAL_HERO_ART.alt}
      description="A short public note about your mathematical interests."
      workspaceClassName="forest-page-workspace-narrow"
    >
      <form action={updateProfileAction} className="panel grid gap-4 p-5">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Profile name</span>
          <input
            name="displayName"
            defaultValue={displayNameForUser(user)}
            minLength={2}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            required
          />
          <small className="muted">
            This is the name other people will see. Your profile URL stays /profile/{user.username}.
          </small>
        </label>
        <label className="grid gap-2">
          <span className="field-label-with-help text-sm font-medium">
            What level of problems would you like to see?
            <span className="help-link" tabIndex={0} title={MATH_LEVEL_HELP_TEXT} aria-label={MATH_LEVEL_HELP_TEXT}>
              ?
            </span>
          </span>
          <select name="mathLevel" defaultValue={user.mathLevel ?? ""}>
            <option value="">Not set</option>
            {MATH_LEVEL_OPTIONS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label} ({level.range})
              </option>
            ))}
          </select>
          <small className="muted">This can be changed anytime.</small>
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Bio</span>
          <textarea name="bio" defaultValue={user.bio ?? ""} placeholder="Algebra, topology, olympiad problems..." />
        </label>
        <button type="submit">Save profile</button>
      </form>
    </ForestPageLayout>
  );
}
