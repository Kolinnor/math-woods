-- Library review remains available, but no longer sends notifications.
-- Delete both read and unread legacy notifications and obsolete preferences.
DELETE FROM "Notification"
WHERE "type" IN ('LIBRARY_ENTRY_SUBMITTED', 'LIBRARY_ENTRY_PUBLISHED', 'LIBRARY_ENTRY_CHANGES_REQUESTED');

DELETE FROM "NotificationPreference"
WHERE "type" IN ('LIBRARY_ENTRY_SUBMITTED', 'LIBRARY_ENTRY_PUBLISHED', 'LIBRARY_ENTRY_CHANGES_REQUESTED');
