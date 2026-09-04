import Link from "next/link";
import { UserName } from "@/components/UserName";

type LibraryUser = {
  username: string;
  profileSlug: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarBackground: string | null;
};

export function LibraryAttribution({
  creator,
  reviewer,
  locale
}: {
  creator: LibraryUser | null;
  reviewer: LibraryUser | null;
  locale: "en" | "fr";
}) {
  if (!creator && !reviewer) return null;
  return (
    <p className="library-attribution">
      {creator && <>{locale === "fr" ? "Proposé par" : "Suggested by"} <Link href={`/profile/${creator.profileSlug}`}><UserName user={creator} /></Link></>}
      {creator && reviewer && <span aria-hidden="true"> · </span>}
      {reviewer && <>{locale === "fr" ? "Relu par" : "Reviewed by"} <Link href={`/profile/${reviewer.profileSlug}`}><UserName user={reviewer} /></Link></>}
    </p>
  );
}
