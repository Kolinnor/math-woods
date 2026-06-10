import { notFound, redirect } from "next/navigation";
import { updateProfileAction } from "@/lib/actions/user-actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function EditProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const currentUser = await requireUser();
  const { username } = await params;

  if (currentUser.username !== username) redirect(`/profile/${username}`);

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold">Edit profile</h1>
      <p className="muted mb-5">A short public note about your mathematical interests.</p>

      <form action={updateProfileAction} className="panel grid gap-4 p-5">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Bio</span>
          <textarea name="bio" defaultValue={user.bio ?? ""} placeholder="Algebra, topology, olympiad problems..." />
        </label>
        <button type="submit">Save profile</button>
      </form>
    </div>
  );
}
