"use client";

import { useState, useTransition } from "react";
import { ThumbsUp } from "lucide-react";
import { ParticleBurstZone } from "@/components/ParticleBurstZone";
import { toggleAnnouncementLikeAction } from "@/lib/actions/announcement-actions";

export function AnnouncementLikeButton({
  announcementId,
  initialLiked,
  initialCount,
  labels
}: {
  announcementId: number;
  initialLiked: boolean;
  initialCount: number;
  labels: { like: string; unlike: string };
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    const wasLiked = liked;
    setLiked(!wasLiked);
    setCount((current) => Math.max(0, current + (wasLiked ? -1 : 1)));
    startTransition(async () => {
      try {
        await toggleAnnouncementLikeAction(announcementId);
      } catch {
        setLiked(wasLiked);
        setCount((current) => Math.max(0, current + (wasLiked ? 1 : -1)));
      }
    });
  };

  return (
    <ParticleBurstZone kind="thumb" active={!liked}>
      <button
        type="button"
        className={`discussion-useful-button${liked ? " is-active" : ""}`}
        aria-pressed={liked}
        title={liked ? labels.unlike : labels.like}
        onClick={toggle}
        disabled={isPending}
      >
        <ThumbsUp size={15} aria-hidden="true" fill={liked ? "currentColor" : "none"} />
        <span>{count}</span>
      </button>
    </ParticleBurstZone>
  );
}
