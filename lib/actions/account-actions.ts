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
import { assertRateLimit } from "@/lib/rate-limit";
import { ASSIGNABLE_ROLES } from "@/lib/roles";
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
    prisma.conceptWatch.deleteMany({ where: { userId: user.id } }),
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
        role: Role.USER
      }
    })
  ]);

  await signOutUser();
  redirect("/");
}

export async function updateUserRoleAction(userId: number, formData: FormData) {
  const owner = await requireOwner();
  await assertRateLimit(`roles:${owner.id}`, 20, 60_000);

  const roleInput = String(formData.get("role") ?? "").toUpperCase();
  const nextRole = ASSIGNABLE_ROLES.includes(roleInput as (typeof ASSIGNABLE_ROLES)[number])
    ? (roleInput as (typeof ASSIGNABLE_ROLES)[number])
    : null;

  if (!nextRole) throw new Error("Invalid role.");

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true }
  });

  if (!target) throw new Error("User not found.");
  if (target.id === owner.id || target.role === Role.OWNER) {
    throw new Error("The owner role cannot be changed here.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: nextRole }
  });

  revalidatePath("/settings");
  revalidatePath("/moderation");
  redirect("/settings?updated=role");
}
