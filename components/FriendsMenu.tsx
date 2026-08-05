import { FriendsMenuClient } from "@/components/FriendsMenuClient";
import { friendsMenuDataForUser } from "@/lib/friends-menu";
import type { PermissionUser } from "@/lib/permissions";

export async function FriendsMenu({ user }: { user: PermissionUser }) {
  return <FriendsMenuClient initialData={await friendsMenuDataForUser(user)} />;
}
