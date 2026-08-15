"use client";

import { ArrowLeft } from "lucide-react";

type DailyScheduleBackButtonProps = {
  href: string;
  label?: string;
};

export function DailyScheduleBackButton({
  href,
  label = "Back to schedule"
}: DailyScheduleBackButtonProps) {
  function returnToSchedule() {
    window.close();

    window.setTimeout(() => {
      window.location.assign(href);
    }, 100);
  }

  return (
    <button type="button" className="button secondary" onClick={returnToSchedule}>
      <ArrowLeft size={15} aria-hidden="true" />
      {label}
    </button>
  );
}
