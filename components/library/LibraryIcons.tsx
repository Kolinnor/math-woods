import type { HistoryMilestoneType, LibraryReferenceType } from "@prisma/client";
import {
  BookOpen, Bookmark, CalendarDays, CirclePlay, Database, FileText, Flag, Globe, GraduationCap, Hourglass,
  Landmark, Lightbulb, MonitorPlay, NotebookPen, ScrollText, Sigma, Trophy, UserRound
} from "lucide-react";

const REFERENCE_ICONS = {
  BOOK: BookOpen, ARTICLE: FileText, LECTURE_NOTES: NotebookPen, THESIS: GraduationCap, VIDEO: CirclePlay,
  CHANNEL: MonitorPlay, WEBSITE: Globe, COMPETITION: Trophy, DATABASE: Database, OTHER: Bookmark
} as const;

const MILESTONE_ICONS = {
  PERIOD: Hourglass, EVENT: CalendarDays, DISCOVERY: Lightbulb, PUBLICATION: ScrollText, NOTATION: Sigma,
  INSTITUTION: Landmark, BIOGRAPHICAL: UserRound, OTHER: Flag
} as const;

export function LibraryReferenceTypeIcon({ type, size = 18 }: { type: LibraryReferenceType; size?: number }) {
  const Icon = REFERENCE_ICONS[type] ?? Bookmark;
  return <Icon size={size} aria-hidden="true" />;
}

export function LibraryMilestoneTypeIcon({ type, size = 16 }: { type: HistoryMilestoneType; size?: number }) {
  const Icon = MILESTONE_ICONS[type] ?? Flag;
  return <Icon size={size} aria-hidden="true" />;
}
