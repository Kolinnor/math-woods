import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MyWorkPage() {
  const user = await requireUser();
  redirect(`/profile/${user.username}`);
}
