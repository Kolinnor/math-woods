export type FriendsMenuSort = "recent" | "alphabetical";

export type FriendsMenuPreferences = {
  showOffline: boolean;
  sort: FriendsMenuSort;
};

export type FriendsMenuPreferenceFriend = {
  lastSeenAt: string | null;
  name: string;
  online: boolean;
  unreadCount: number;
  username: string;
};

export const FRIENDS_MENU_PREFERENCES_STORAGE_KEY = "math-woods:friends-menu-preferences:v1";

export const DEFAULT_FRIENDS_MENU_PREFERENCES: FriendsMenuPreferences = {
  showOffline: true,
  sort: "recent"
};

export function parseFriendsMenuPreferences(raw: string | null): FriendsMenuPreferences {
  if (!raw) return { ...DEFAULT_FRIENDS_MENU_PREFERENCES };

  try {
    const value = JSON.parse(raw) as Partial<FriendsMenuPreferences> | null;
    return {
      showOffline: typeof value?.showOffline === "boolean"
        ? value.showOffline
        : DEFAULT_FRIENDS_MENU_PREFERENCES.showOffline,
      sort: value?.sort === "alphabetical" || value?.sort === "recent"
        ? value.sort
        : DEFAULT_FRIENDS_MENU_PREFERENCES.sort
    };
  } catch {
    return { ...DEFAULT_FRIENDS_MENU_PREFERENCES };
  }
}

export function friendsForMenu<Friend extends FriendsMenuPreferenceFriend>(
  friends: Friend[],
  preferences: FriendsMenuPreferences,
  locale: string
) {
  return friends
    .filter((friend) => preferences.showOffline || friend.online || friend.unreadCount > 0)
    .slice()
    .sort((left, right) => {
      if (preferences.sort === "recent") {
        const activityDifference = activityTime(right.lastSeenAt) - activityTime(left.lastSeenAt);
        if (activityDifference !== 0) return activityDifference;
      }

      return left.name.localeCompare(right.name, locale, { sensitivity: "base" })
        || left.username.localeCompare(right.username, locale, { sensitivity: "base" });
    });
}

function activityTime(value: string | null) {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
