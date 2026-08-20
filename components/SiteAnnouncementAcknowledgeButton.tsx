"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { acknowledgeSiteAnnouncementAction } from "@/lib/actions/site-announcement-actions";

export function SiteAnnouncementAcknowledgeButton({
  announcementId,
  label,
  pendingLabel
}: {
  announcementId: number;
  label: string;
  pendingLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="site-announcement-acknowledge"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await acknowledgeSiteAnnouncementAction(announcementId);
          router.refresh();
        });
      }}
    >
      <Check size={18} strokeWidth={2.5} aria-hidden="true" />
      {pending ? pendingLabel : label}
    </button>
  );
}
