"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  requireOwner,
  requireUser,
  revokeOtherSessionsForCurrentUser,
  signOutUser,
  updatePasswordForCurrentUser
} from "@/lib/auth";
import { boundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { createAndSendEmailVerification } from "@/lib/email-verification";
import { assignableRolesFor, canAssignRole } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { displayNameForUser } from "@/lib/user-display";

export async function changePasswordAction(formData: FormData) {
  const user = await requireUser();
  const currentPassword = boundedText(formData.get("currentPassword"), 512, "Current password", { trim: false });
  const newPassword = boundedText(formData.get("newPassword"), 512, "New password", { trim: false });
  await assertRateLimit(`change-password:${user.id}`, 5, 60_000);
  await updatePasswordForCurrentUser(currentPassword, newPassword);
  revalidatePath("/settings");
  redirect("/settings?updated=password");
}

export async function revokeOtherSessionsAction() {
  const user = await requireUser();
  await assertRateLimit(`revoke-sessions:${user.id}`, 10, 60_000);
  await revokeOtherSessionsForCurrentUser();
  revalidatePath("/settings");
  redirect("/settings?updated=sessions");
}

export async function resendEmailVerificationAction() {
  const user = await requireUser();
  try {
    await assertRateLimit(`email-verification:${user.id}`, 3, 60 * 60 * 1000);
  } catch {
    redirect("/settings?verify=rate-limited");
  }
  const delivery = await createAndSendEmailVerification(user.id);
  revalidatePath("/settings");
  redirect(delivery.sent ? "/settings?verify=sent" : `/settings?verify=${delivery.reason}`);
}

export async function deleteAccountAction(formData: FormData) {
  const user = await requireUser();
  await assertRateLimit(`delete-account:${user.id}`, 5, 60_000);

  if (user.role === Role.OWNER) {
    redirect("/settings?deleteAccount=owner");
  }

  const accountName = displayNameForUser(user);
  const confirmation = boundedText(formData.get("accountName"), 100, "Account name");
  if (confirmation !== accountName) {
    redirect("/settings?deleteAccount=confirm");
  }

  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.externalIdentity.deleteMany({ where: { userId: user.id } }),
    prisma.oAuthAttempt.deleteMany({ where: { linkUserId: user.id } }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
    prisma.notification.deleteMany({ where: { userId: user.id } }),
    prisma.notification.updateMany({ where: { actorId: user.id }, data: { actorId: null } }),
    prisma.notificationPreference.deleteMany({ where: { userId: user.id } }),
    prisma.achievementUnlock.deleteMany({ where: { userId: user.id } }),
    prisma.latexPreference.deleteMany({ where: { userId: user.id } }),
    prisma.problemFavorite.deleteMany({ where: { userId: user.id } }),
    prisma.problemAttempt.deleteMany({ where: { userId: user.id } }),
    prisma.vote.deleteMany({ where: { userId: user.id } }),
    prisma.report.deleteMany({ where: { reporterId: user.id } }),
    prisma.playlistFollow.deleteMany({ where: { userId: user.id } }),
    prisma.problemVerificationRequest.deleteMany({ where: { userId: user.id } }),
    prisma.problemVerificationRequest.updateMany({ where: { reviewerId: user.id }, data: { reviewerId: null } }),
    prisma.problemVerificationMessage.deleteMany({ where: { authorId: user.id } }),
    prisma.suggestion.updateMany({ where: { authorId: user.id }, data: { authorId: null } }),
    prisma.errorReport.updateMany({ where: { userId: user.id }, data: { userId: null } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        username: `deleted-user-${user.id}`,
        displayName: null,
        email: null,
        emailVerifiedAt: null,
        passwordHash: null,
        bio: null,
        mathLevel: null,
        reputation: 0,
        role: Role.USER,
        deletedAt: new Date()
      }
    })
  ]);

  await signOutUser();
  redirect("/");
}

export async function updateUserRoleAction(userId: number, formData: FormData) {
  const actor = await requireOwner();
  await assertRateLimit(`roles:${actor.id}`, 20, 60_000);

  const roleInput = String(formData.get("role") ?? "").toUpperCase();
  const assignableRoles = assignableRolesFor(actor.role);
  const nextRole = assignableRoles.includes(roleInput as (typeof assignableRoles)[number])
    ? (roleInput as (typeof assignableRoles)[number])
    : null;

  if (!nextRole) throw new Error("Invalid role.");

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, deletedAt: true }
  });

  if (!target) throw new Error("User not found.");
  if (target.deletedAt) throw new Error("Restore this user before changing roles.");
  if (!canAssignRole(actor, target, nextRole)) {
    throw new Error("You cannot assign this role.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: nextRole }
  });

  revalidatePath("/settings");
  revalidatePath("/moderation");
  redirect("/settings?updated=role");
}

export async function updateUserDeletedStatusAction(
  userId: number,
  nextStatus: "active" | "deleted",
  _formData: FormData
) {
  const actor = await requireOwner();
  await assertRateLimit(`user-status:${actor.id}`, 20, 60_000);

  if (actor.id === userId) throw new Error("You cannot move your own account.");
  if (nextStatus !== "active" && nextStatus !== "deleted") throw new Error("Invalid user status.");

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true }
  });

  if (!target) throw new Error("User not found.");
  if (target.role === Role.OWNER) throw new Error("The owner account cannot be moved.");

  const deletedAt = nextStatus === "deleted" ? new Date() : null;

  if (deletedAt) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { deletedAt }
      }),
      prisma.session.deleteMany({ where: { userId } })
    ]);
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: { deletedAt }
    });
  }

  revalidatePath("/settings");
  revalidatePath("/moderation");
  redirect(`/settings?tab=admin&adminUsers=${nextStatus}&updated=user-status`);
}
