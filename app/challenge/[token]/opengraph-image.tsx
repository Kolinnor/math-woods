import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { markdownExcerpt } from "@/lib/metadata-text";
import {
  normalizeProblemChallengeInviteToken,
  problemChallengeInviteTokenHash
} from "@/lib/problem-challenge-invites";

export const alt = "A Math Woods challenge with crossed swords";
export const size = {
  width: 1200,
  height: 630
};
export const contentType = "image/png";

function SwordsMark() {
  return (
    <svg
      width="148"
      height="148"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#246b48"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
      <line x1="13" x2="19" y1="19" y2="13" />
      <line x1="16" x2="20" y1="16" y2="20" />
      <line x1="19" x2="21" y1="21" y2="19" />
      <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
      <line x1="5" x2="9" y1="14" y2="18" />
      <line x1="7" x2="4" y1="17" y2="20" />
      <line x1="3" x2="5" y1="19" y2="21" />
    </svg>
  );
}

export default async function ChallengeOpenGraphImage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: tokenValue } = await params;
  const token = normalizeProblemChallengeInviteToken(tokenValue);
  const invite = token
    ? await prisma.problemChallengeInvite.findUnique({
        where: { tokenHash: problemChallengeInviteTokenHash(token) },
        select: {
          expiresAt: true,
          challenger: {
            select: {
              deletedAt: true
            }
          },
          problem: {
            select: {
              title: true,
              listed: true,
              status: true
            }
          }
        }
      })
    : null;
  const problemTitle =
    invite &&
    !invite.challenger.deletedAt &&
    invite.expiresAt > new Date() &&
    invite.problem.listed &&
    invite.problem.status === "PUBLISHED"
      ? markdownExcerpt(invite.problem.title, "Math Woods problem", 110)
      : "Math Woods problem";
  const problemTitleSize = problemTitle.length > 72 ? 21 : problemTitle.length > 44 ? 24 : 28;

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#f8faf7",
          border: "18px solid #194f36",
          color: "#17261e",
          display: "flex",
          height: "100%",
          padding: "72px 84px",
          width: "100%"
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "#e4f0e7",
            border: "3px solid #72a282",
            borderRadius: 28,
            color: "#246b48",
            display: "flex",
            height: 250,
            justifyContent: "center",
            marginRight: 68,
            width: 250
          }}
        >
          <SwordsMark />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            maxWidth: 680
          }}
        >
          <div
            style={{
              color: "#246b48",
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: 4,
              marginBottom: 26
            }}
          >
            MATH WOODS
          </div>
          <div
            style={{
              fontFamily: "serif",
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1.08
            }}
          >
            You have been challenged
          </div>
          <div
            style={{
              color: "#52645a",
              fontSize: problemTitleSize,
              lineHeight: 1.3,
              marginTop: 28,
              maxWidth: 660
            }}
          >
            {problemTitle}
          </div>
        </div>
      </div>
    ),
    size
  );
}
