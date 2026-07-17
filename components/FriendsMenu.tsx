import { FriendsMenuClient } from "@/components/FriendsMenuClient";
import { friendsMenuDataForUser } from "@/lib/friends-menu";

export async function FriendsMenu({ userId }: { userId: number }) {
  return <FriendsMenuClient initialData={await friendsMenuDataForUser(userId)} />;
}
