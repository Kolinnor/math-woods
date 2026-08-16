import { ConceptStatus } from "@prisma/client";
import {
  BadgeCheck,
  BookOpen,
  CircleDashed,
  FilePenLine,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  type LucideIcon
} from "lucide-react";

const STATUS_ICONS: Record<ConceptStatus, LucideIcon> = {
  [ConceptStatus.MISSING]: CircleDashed,
  [ConceptStatus.STUB]: FilePenLine,
  [ConceptStatus.USABLE]: BookOpen,
  [ConceptStatus.REVIEWED]: BadgeCheck,
  [ConceptStatus.EXCELLENT]: Sparkles,
  [ConceptStatus.CONTROVERSIAL]: TriangleAlert
};

export function ConceptStatusBadge({ status, label }: { status: ConceptStatus; label: string }) {
  const Icon = STATUS_ICONS[status];

  return (
    <span className={`concept-status-badge concept-status-${status.toLowerCase()}`}>
      <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function ConceptEditedBadge({ label }: { label: string }) {
  return (
    <span className="concept-status-badge concept-status-edited">
      <RefreshCw size={12} strokeWidth={2.2} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
