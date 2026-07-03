"use server";

import type { Route } from "next";
import { ContributionRequestKind, ContributionRequestStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { canUseAdminTools, canUseModerationTools } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";

function contributionRequestKind(value: string) {
  if (value === ContributionRequestKind.PROBLEM || value === ContributionRequestKind.CONCEPT) return value;
  throw new Error("Unknown request type.");
}

function revalidateContributionRequests() {
  revalidatePath("/contributing");
  revalidatePath("/problems");
  revalidatePath("/concepts");
}

export async function createContributionRequestAction(
  kindInput: string,
  returnTo: "/problems" | "/concepts" | "/contributing",
  formData: FormData
) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`contribution-request:create:${user.id}`, 8, 60_000);
  const kind = contributionRequestKind(kindInput);
  const body = requiredBoundedText(formData.get("body"), CONTENT_LIMITS.longNote, "Request");

  await prisma.contributionRequest.create({
    data: {
      kind,
      body,
      requesterId: user.id
    }
  });

  revalidateContributionRequests();
  redirect(`${returnTo}?request=created` as Route);
}

async function requireRequestCurator() {
  const user = await requireVerifiedUser();
  if (!canUseModerationTools(user)) throw new Error("Only trusted users can manage requests.");
  await assertRateLimit(`contribution-request:manage:${user.id}`, 80, 60_000);
  return user;
}

export async function claimContributionRequestAction(requestId: number) {
  const user = await requireRequestCurator();
  const request = await prisma.contributionRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true }
  });

  if (!request) throw new Error("Request not found.");
  if (request.status === ContributionRequestStatus.COMPLETED) throw new Error("This request is already complete.");
  if (request.status === ContributionRequestStatus.CLAIMED) throw new Error("This request is already claimed.");

  await prisma.contributionRequest.update({
    where: { id: request.id },
    data: {
      status: ContributionRequestStatus.CLAIMED,
      claimedById: user.id,
      completedAt: null
    }
  });

  revalidateContributionRequests();
  redirect("/contributing?request=claimed");
}

export async function releaseContributionRequestAction(requestId: number) {
  const user = await requireRequestCurator();
  const request = await prisma.contributionRequest.findUnique({
    where: { id: requestId },
    select: { id: true, claimedById: true, status: true }
  });

  if (!request) throw new Error("Request not found.");
  if (request.status === ContributionRequestStatus.COMPLETED) throw new Error("This request is already complete.");
  if (request.claimedById !== user.id && !canUseAdminTools(user)) {
    throw new Error("Only the current assignee or an admin can release this request.");
  }

  await prisma.contributionRequest.update({
    where: { id: request.id },
    data: {
      status: ContributionRequestStatus.OPEN,
      claimedById: null,
      completedAt: null
    }
  });

  revalidateContributionRequests();
  redirect("/contributing?request=released");
}

export async function completeContributionRequestAction(requestId: number) {
  const user = await requireRequestCurator();
  const request = await prisma.contributionRequest.findUnique({
    where: { id: requestId },
    select: { id: true, claimedById: true, status: true }
  });

  if (!request) throw new Error("Request not found.");
  if (request.status === ContributionRequestStatus.COMPLETED) throw new Error("This request is already complete.");
  if (request.claimedById !== user.id && !canUseAdminTools(user)) {
    throw new Error("Only the current assignee or an admin can complete this request.");
  }

  await prisma.contributionRequest.update({
    where: { id: request.id },
    data: {
      status: ContributionRequestStatus.COMPLETED,
      completedAt: new Date(),
      claimedById: request.claimedById ?? user.id
    }
  });

  revalidateContributionRequests();
  redirect("/contributing?request=completed");
}
