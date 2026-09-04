import { BookOpen } from "lucide-react";

export function LibraryEmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="library-empty">
      <BookOpen size={24} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
