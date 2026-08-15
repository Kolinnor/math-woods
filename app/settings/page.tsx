import { NotificationType, Role } from "@prisma/client";
import Link from "next/link";
import { EditorSettingsVisitedMarker } from "@/components/EditorSettingsVisitedMarker";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { OAuthProviderIcon } from "@/components/OAuthProviderIcon";
import { UserName } from "@/components/UserName";
import {
  changePasswordAction,
  deleteAccountAction,
  resendEmailVerificationAction,
  revokeOtherSessionsAction,
  updateUserDeletedStatusAction,
  updateUserRoleAction
} from "@/lib/actions/account-actions";
import { resetLatexPreferencesAction, updateLatexPreferencesAction } from "@/lib/actions/latex-preference-actions";
import { updateNotificationPreferencesAction } from "@/lib/actions/notification-actions";
import { disconnectExternalIdentityAction, setInitialPasswordAction } from "@/lib/actions/oauth-actions";
import { getCurrentSession, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EXPLORATIONS_ENABLED } from "@/lib/feature-flags";
import { mailStatusLabel } from "@/lib/email-verification";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { mergeLatexPreferences, type LatexPreferenceValues } from "@/lib/latex-preferences";
import { contentLanguageLabel } from "@/lib/languages";
import { configuredOAuthProviders, oauthProviderKey, oauthProviderLabel } from "@/lib/oauth";
import { assignableRolesFor, canAssignRole, canManageUserRoles, canUseOwnerTools } from "@/lib/permissions";
import { roleLabel } from "@/lib/roles";
import { translationDashboard } from "@/lib/translation-dashboard";
import { displayNameForUser } from "@/lib/user-display";
import { parseUserDiscoverySource } from "@/lib/user-discovery-source";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { settingsText } from "./settings-copy";

export const dynamic = "force-dynamic";

function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

type ManagedUser = {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  role: Role;
  createdAt: Date;
  deletedAt: Date | null;
};

function isDeletedUser(user: ManagedUser) {
  return Boolean(user.deletedAt || (user.email === null && user.username.startsWith("deleted-user-")));
}

const notificationOptions = [
  {
    type: NotificationType.PROBLEM_ATTEMPTED,
    title: "Someone started working on your problem",
    description: "When another user starts working on one of your problems."
  },
  {
    type: NotificationType.PROBLEM_SOLVED,
    title: "Someone solved your problem",
    description: "When another user marks one of your problems as solved."
  },
  {
    type: NotificationType.PROBLEM_EDITED,
    title: "Someone edited your problem",
    description: "When another user edits a problem you created."
  },
  {
    type: NotificationType.PROOF_ADDED,
    title: "Someone added a solution",
    description: "When another user adds a solution to one of your problems."
  },
  {
    type: NotificationType.SOLUTION_VOTED,
    title: "Someone liked your solution",
    description: "When another user marks one of your solutions as useful."
  },
  {
    type: NotificationType.SOLUTION_REPORTED,
    title: "Solution issue reports",
    description: "When someone reports a potential issue on your solution or your own report is reviewed."
  },
  {
    type: NotificationType.DISCUSSION_POSTED,
    title: "Someone posted in your problem discussion",
    description: "When another user posts a comment, hint, solution, generalization, or correction."
  },
  {
    type: NotificationType.ACHIEVEMENT_UNLOCKED,
    title: "Achievement unlocked",
    description: "When you unlock a Math Woods achievement."
  },
  {
    type: NotificationType.VERIFICATION_REQUESTED,
    title: "Someone requested solution verification",
    description: "When another user asks you to validate their answer to one of your problems."
  },
  {
    type: NotificationType.VERIFICATION_MESSAGE,
    title: "Someone replied in a private verification discussion",
    description: "When the problem author or solver replies inside a solution verification thread."
  },
  {
    type: NotificationType.VERIFICATION_APPROVED,
    title: "Your solution verification was approved",
    description: "When a problem author accepts your submitted answer."
  },
  {
    type: NotificationType.VERIFICATION_REJECTED,
    title: "Your solution verification was rejected",
    description: "When a problem author does not accept your submitted answer yet."
  },
  {
    type: NotificationType.SITE_ERROR_REPORTED,
    title: "A site error was reported",
    description: "For admins: when a user hits a client or application error."
  },
  {
    type: NotificationType.USER_REGISTERED,
    title: "A user created an account",
    description: "For the owner: when a user joins Math Woods."
  },
  {
    type: NotificationType.PROBLEM_CREATED,
    title: "A problem was created",
    description: "For the owner: when a user creates a problem."
  },
  {
    type: NotificationType.CONCEPT_CREATED,
    title: "A concept was created",
    description: "For the owner: when a user creates a concept."
  },
  {
    type: NotificationType.CONCEPT_EDITED,
    title: "A concept was edited",
    description: "For the owner: when a user edits or rolls back a concept."
  },
  {
    type: NotificationType.CONTRIBUTION_REQUEST_CLAIMED,
    title: "A contribution request was claimed",
    description: "When someone starts working on one of your requests. The owner receives these for all requests."
  },
  {
    type: NotificationType.CONTRIBUTION_REQUEST_REMINDER,
    title: "Contribution request reminders",
    description: "A daily reminder when you have claimed contribution requests still in progress."
  },
  {
    type: NotificationType.FRIEND_REQUEST,
    title: "Friend requests",
    description: "When someone sends or accepts a friend request."
  },
  {
    type: NotificationType.CHAT_MESSAGE,
    title: "Private chat messages",
    description: "When a friend sends you a private message."
  },
  {
    type: NotificationType.PROBLEM_CHALLENGE,
    title: "Problem challenges",
    description: "When another user challenges you to solve a problem."
  },
  {
    type: NotificationType.PROBLEM_SHARED,
    title: "Problems shared with you",
    description: "When another user shares a problem directly with you."
  },
  {
    type: NotificationType.PROBLEM_OF_THE_DAY,
    title: "Problem of the day selections",
    description: "When one of your problems is selected as the problem of the day."
  },
  ...(EXPLORATIONS_ENABLED
    ? [{
        type: NotificationType.EXPLORATION_PUBLISHED,
        title: "Exploration publications",
        description: "When an exploration you follow is published."
      }]
    : []),
  {
    type: NotificationType.DAILY_CONCEPT_REVIEW,
    title: "Daily concept review",
    description: "For trusted users and admins: one older concept to improve, with no new suggestion until it is handled."
  },
  {
    type: NotificationType.CONTEST_UPDATE,
    title: "Weekly contest updates",
    description: "When a contest begins, approaches its deadline, or announces its results."
  }
] as const;

type LatexToggleKey = {
  [Key in keyof LatexPreferenceValues]: LatexPreferenceValues[Key] extends boolean ? Key : never;
}[keyof LatexPreferenceValues];

const latexToggleSections: Array<{
  title: string;
  description: string;
  options: Array<{
    name: LatexToggleKey;
    title: string;
    description: string;
  }>;
}> = [
  {
    title: "Math delimiters",
    description: "Small helpers around inline and block math while writing Markdown.",
    options: [
      {
        name: "autocloseDollars",
        title: "Autoclose $ symbols",
        description: "Typing one $ can automatically complete the math pair."
      },
      {
        name: "mathShortcuts",
        title: "Shortcuts for inline and block math",
        description: "Keep quick keyboard shortcuts available for $...$ and $$...$$ blocks."
      },
      {
        name: "moveCursorBetweenDollars",
        title: "Move cursor between $ symbols",
        description: "When a math pair is inserted, place the cursor inside it."
      },
      {
        name: "encloseSelectionDollars",
        title: "Wrap selected text with math symbols",
        description: "Selecting text and pressing $ can turn the selection into math."
      }
    ]
  },
  {
    title: "Brackets and scripts",
    description: "Automatic closing and repair for common LaTeX structures.",
    options: [
      {
        name: "autocloseCurlyBrackets",
        title: "Autoclose { curly brackets",
        description: "Typing { can automatically close with }."
      },
      {
        name: "autocloseSquareBrackets",
        title: "Autoclose [ square brackets",
        description: "Typing [ can automatically close with ]."
      },
      {
        name: "autocloseRoundBrackets",
        title: "Autoclose ( round brackets",
        description: "Typing ( can automatically close with )."
      },
      {
        name: "autoEnlargeBrackets",
        title: "Auto enlarge brackets around large expressions",
        description: "Prefer \\left and \\right around brackets containing \\sum, \\int, or \\frac."
      },
      {
        name: "superscriptBraces",
        title: "Enclose superscripts with { }",
        description: "Help turn powers such as ^12 into ^{12}."
      },
      {
        name: "subscriptBraces",
        title: "Enclose subscripts with { }",
        description: "Help turn indices such as _ij into _{ij}."
      }
    ]
  },
  {
    title: "Common expressions",
    description: "Shortcuts for formulas that appear constantly in problem writing.",
    options: [
      {
        name: "appendSumLimits",
        title: "Append \\limits after \\sum",
        description: "Use display-style limits more easily for summations."
      },
      {
        name: "slashFractions",
        title: "Type / instead of \\frac{}{}",
        description: "Allow quick fraction input such as 1/2 becoming \\frac{1}{2}."
      },
      {
        name: "greekMathMode",
        title: "Greek symbols math mode",
        description: "Typing commands such as \\alpha outside math can wrap them as $\\alpha$."
      }
    ]
  },
  {
    title: "Blocks",
    description: "Helpers for align, cases, and matrix environments.",
    options: [
      {
        name: "alignShortcut",
        title: "Shortcut for align blocks",
        description: "Quickly insert a \\begin{...} ... \\end{...} align block."
      },
      {
        name: "casesShortcut",
        title: "Shortcut for cases blocks",
        description: "Quickly insert a cases block."
      },
      {
        name: "shiftEnterLineBreaks",
        title: "Use Shift+Enter for line breaks in align and cases",
        description: "Reserve Enter for normal behavior, and use Shift+Enter for \\\\ or &."
      },
      {
        name: "matrixShortcut",
        title: "Shortcut for matrix blocks",
        description: "Quickly insert a matrix environment."
      }
    ]
  },
  {
    title: "Custom shorthand",
    description: "User-defined replacements for frequent symbols and snippets.",
    options: [
      {
        name: "customShorthand",
        title: "Enable custom shorthand",
        description: "Expand your personal shortcuts into LaTeX snippets."
      },
      {
        name: "tabCompletesShorthand",
        title: "Use Tab to complete custom shorthand",
        description: "Use Tab instead of Space to expand personal shortcuts."
      }
    ]
  }
] as const;

const latexTextOptions: Array<{
  name: keyof Pick<LatexPreferenceValues, "alignEnvironment" | "autoAlignSymbols" | "matrixEnvironment">;
  title: string;
  description: string;
}> = [
  {
    name: "alignEnvironment",
    title: "Align block parameter",
    description: "The environment used by align shortcuts, for example align or align*."
  },
  {
    name: "autoAlignSymbols",
    title: "Auto-align at these symbols",
    description: "Symbols that should receive an alignment marker in align blocks. Separate them with spaces."
  },
  {
    name: "matrixEnvironment",
    title: "Matrix block parameter",
    description: "The matrix environment inserted by shortcuts, for example pmatrix, bmatrix, or matrix."
  }
];

const markdownHeadingShortcutOptions: Array<{
  name: keyof Pick<
    LatexPreferenceValues,
    | "markdownHeading1Shortcut"
    | "markdownHeading2Shortcut"
    | "markdownHeading3Shortcut"
    | "markdownHeading4Shortcut"
    | "markdownHeading5Shortcut"
    | "markdownHeading6Shortcut"
  >;
  title: string;
}> = [
  { name: "markdownHeading1Shortcut", title: "Heading 1" },
  { name: "markdownHeading2Shortcut", title: "Heading 2" },
  { name: "markdownHeading3Shortcut", title: "Heading 3" },
  { name: "markdownHeading4Shortcut", title: "Heading 4" },
  { name: "markdownHeading5Shortcut", title: "Heading 5" },
  { name: "markdownHeading6Shortcut", title: "Heading 6" }
];

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: Promise<{
    tab?: string;
    updated?: string;
    verify?: string;
    deleteAccount?: string;
    adminUsers?: string;
    oauth?: string;
  }>;
}) {
  const user = await requireUser();
  const currentSession = await getCurrentSession();
  const [interfaceLocale, t] = await Promise.all([getInterfaceLocale(), getTranslations()]);
  const text = (value: string) => settingsText(interfaceLocale, value);
  const params = searchParams ? await searchParams : {};
  const canManageRoles = canManageUserRoles(user);
  const canUseTranslationsDashboard = canUseOwnerTools(user);
  const requestedTab =
    params.tab === "notifications" || params.tab === "admin" || params.tab === "latex" || params.tab === "translations"
      ? params.tab
      : "account";
  const tab =
    (requestedTab === "admin" && !canManageRoles) ||
    (requestedTab === "translations" && !canUseTranslationsDashboard)
      ? "account"
      : requestedTab;
  const adminUsersTab = params.adminUsers === "deleted" ? "deleted" : "active";
  const verifyStatus = params.verify;
  const [sessions, notificationPreferences, savedLatexPreferences, externalIdentities] = await Promise.all([
    prisma.session.findMany({
      where: {
        userId: user.id,
        expiresAt: { gt: new Date() }
      },
      orderBy: { lastSeenAt: "desc" }
    }),
    prisma.notificationPreference.findMany({
      where: { userId: user.id }
    }),
    prisma.latexPreference.findUnique({
      where: { userId: user.id }
    }),
    prisma.externalIdentity.findMany({
      where: { userId: user.id },
      orderBy: { provider: "asc" }
    })
  ]);
  const oauthProviders = configuredOAuthProviders();
  const connectedProviders = new Set(externalIdentities.map((identity) => identity.provider));
  const latexPreferences = mergeLatexPreferences(savedLatexPreferences);
  const notificationPreferenceMap = new Map(
    notificationPreferences.map((preference) => [preference.type, preference.enabled])
  );
  const accountName = displayNameForUser(user);
  const roleUsers = canManageRoles
    ? await prisma.user.findMany({
        orderBy: [{ role: "desc" }, { username: "asc" }],
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarBackground: true,
          avatarUrl: true,
          email: true,
          discoverySource: true,
          discoverySourceDetail: true,
          role: true,
          createdAt: true,
          deletedAt: true
        }
      })
    : [];
  const activeUsers = roleUsers.filter((managedUser) => !isDeletedUser(managedUser));
  const deletedUsers = roleUsers.filter(isDeletedUser);
  const shownAdminUsers = adminUsersTab === "deleted" ? deletedUsers : activeUsers;
  const translationsDashboard = tab === "translations" ? await translationDashboard() : null;

  return (
    <ForestPageLayout
      title={text("Settings")}
      eyebrow={text("Account")}
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      description={text("Appearance, account security, and active sessions for {name}.").replace(
        "{name}",
        displayNameForUser(user)
      )}
      workspaceClassName="forest-page-workspace-narrow"
    >
      {params.updated === "password" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          {text("Password updated. Other sessions were revoked.")}
        </p>
      )}
      {params.updated === "sessions" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          {text("Other sessions were revoked.")}
        </p>
      )}
      {params.updated === "role" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          {text("User role updated.")}
        </p>
      )}
      {params.updated === "user-status" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          {text("User status updated.")}
        </p>
      )}
      {params.updated === "notifications" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          {text("Notification preferences updated.")}
        </p>
      )}
      {params.updated === "latex" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          {text("Editor preferences updated.")}
        </p>
      )}
      {params.updated === "latex-reset" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          {text("Editor preferences reset to default.")}
        </p>
      )}
      {params.oauth === "connected" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">{text("Account connected.")}</p>
      )}
      {params.oauth === "disconnected" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">{text("Connected account removed.")}</p>
      )}
      {params.oauth === "last-method" && (
        <p className="panel border-amber-700 bg-amber-50 p-4 text-sm text-amber-950">
          {text("Add a password or another connected account before removing your only sign-in method.")}
        </p>
      )}
      {params.oauth === "failed" && (
        <p className="panel border-amber-700 bg-amber-50 p-4 text-sm text-amber-950">
          {text("The connected account could not be updated. Please try again.")}
        </p>
      )}
      {params.deleteAccount === "confirm" && (
        <p className="panel border-amber-700 bg-amber-50 p-4 text-sm text-amber-950">
          {text("Type your account name exactly to delete your account.")}
        </p>
      )}
      {params.deleteAccount === "owner" && (
        <p className="panel border-amber-700 bg-amber-50 p-4 text-sm text-amber-950">
          {text("The owner account cannot be deleted here.")}
        </p>
      )}
      {verifyStatus === "sent" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          {text("Verification email sent.")}
        </p>
      )}
      {verifyStatus === "required" && (
        <p className="panel border-amber-700 bg-amber-50 p-4 text-sm text-amber-950">
          {text("Verify your email to unlock contributions.")}
        </p>
      )}
      {verifyStatus === "rate-limited" && (
        <p className="panel border-amber-700 bg-amber-50 p-4 text-sm text-amber-950">
          {text("Too many requests. Please try again later.")}
        </p>
      )}
      {(verifyStatus === "not-configured" || verifyStatus === "send-failed") && (
        <p className="panel border-amber-700 bg-amber-50 p-4 text-sm text-amber-950">
          {text("Verification email could not be sent yet.")}
        </p>
      )}
      {verifyStatus === "already-verified" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          {text("Your email is already verified.")}
        </p>
      )}

      <nav className="tab-nav" aria-label={text("Settings sections")}>
        <Link href="/settings" className={tab === "account" ? "active" : ""}>
          {text("Account")}
        </Link>
        <Link href="/settings?tab=notifications" className={tab === "notifications" ? "active" : ""}>
          {text("Notifications")}
        </Link>
        <Link href="/settings?tab=latex" className={tab === "latex" ? "active" : ""}>
          {text("Editor")}
        </Link>
        {canManageRoles && (
          <Link href="/settings?tab=admin" className={tab === "admin" ? "active" : ""}>
            Admin
          </Link>
        )}
        {canUseTranslationsDashboard && (
          <Link href="/settings?tab=translations" className={tab === "translations" ? "active" : ""}>
            {text("Translations")}
          </Link>
        )}
      </nav>

      {tab === "account" && (
        <>
          <section className="panel p-5">
            <h2 className="mb-2 text-lg font-semibold">{text("Email verification")}</h2>
            {user.emailVerifiedAt ? (
              <p className="text-sm">
                <strong>{user.email}</strong> {text("is verified.")}
              </p>
            ) : (
              <div className="grid gap-3">
                <p className="muted text-sm">
                  {text("Verify {email} to unlock contributions.")
                    .split("{email}")
                    .map((part, index) => (
                      <span key={part || index}>
                        {index > 0 && <strong>{user.email}</strong>}
                        {part}
                      </span>
                    ))}
                </p>
                <p className="muted text-xs">{text(mailStatusLabel())}</p>
                <form action={resendEmailVerificationAction}>
                  <button type="submit" className="secondary">
                    {text("Resend verification email")}
                  </button>
                </form>
              </div>
            )}
          </section>

          {(externalIdentities.length > 0 || oauthProviders.length > 0) && (
          <section className="panel p-5">
            <h2 className="mb-2 text-lg font-semibold">{text("Connected accounts")}</h2>
            <p className="muted mb-4 text-sm">{text("Use a connected account to sign in without entering your Math Woods password.")}</p>
            <div className="grid gap-3">
              {externalIdentities.map((identity) => (
                <div key={identity.id} className="oauth-connected-account">
                  <div className="oauth-connected-account-identity">
                    <OAuthProviderIcon provider={oauthProviderKey(identity.provider)} />
                    <div>
                      <strong>{oauthProviderLabel(identity.provider)}</strong>
                      {identity.providerEmail && <p className="muted text-sm">{identity.providerEmail}</p>}
                    </div>
                  </div>
                  <form action={disconnectExternalIdentityAction}>
                    <input type="hidden" name="provider" value={identity.provider} />
                    <button type="submit" className="secondary">{text("Disconnect")}</button>
                  </form>
                </div>
              ))}
              {oauthProviders
                .filter((provider) => !connectedProviders.has(provider.provider))
                .map((provider) => (
                  <Link
                    key={provider.key}
                    href={`/api/auth/${oauthProviderKey(provider.provider)}/start?mode=link&returnTo=%2Fsettings` as never}
                    className="button secondary oauth-connect-button"
                  >
                    <OAuthProviderIcon provider={provider.key} />
                    <span>{text("Connect")} {provider.label}</span>
                  </Link>
                ))}
            </div>
          </section>
          )}

          <section className="panel p-5">
            <h2 className="mb-4 text-lg font-semibold">{text(user.passwordHash ? "Change password" : "Add a password")}</h2>
            <form action={user.passwordHash ? changePasswordAction : setInitialPasswordAction} className="grid gap-4">
              {user.passwordHash && (
                <label className="grid gap-2">
                  <span className="text-sm font-medium">{text("Current password")}</span>
                  <input name="currentPassword" type="password" required />
                </label>
              )}
              <label className="grid gap-2">
                <span className="text-sm font-medium">{text(user.passwordHash ? "New password" : "Add a password")}</span>
                <input name="newPassword" type="password" minLength={8} required />
              </label>
              <button type="submit">{text(user.passwordHash ? "Update password" : "Set password")}</button>
            </form>
          </section>

          <section className="panel p-5">
            <h2 className="mb-2 text-lg font-semibold">{text("Data tools")}</h2>
            <p className="muted mb-4 text-sm">
              {text("Bring Markdown notes into Math Woods. Problem and concept pages can be exported individually.")}
            </p>
            <Link href="/import" className="button secondary">
              {text("Import Markdown")}
            </Link>
          </section>

          <section className="panel p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{text("Active sessions")}</h2>
                <p className="muted text-sm">{text("Sessions expire after 30 days.")}</p>
              </div>
              <form action={revokeOtherSessionsAction}>
                <button type="submit" className="secondary">
                  {text("Revoke others")}
                </button>
              </form>
            </div>

            <div className="grid gap-3">
              {sessions.map((session) => (
                <div key={session.id} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {text(session.id === currentSession?.id ? "Current session" : "Signed-in session")}
                    </span>
                    <span className="muted">{text("Expires")} {formatDate(session.expiresAt, interfaceLocale)}</span>
                  </div>
                  <p className="muted mt-1">
                    {text("Created")} {formatDate(session.createdAt, interfaceLocale)}. {text("Last seen")} {formatDate(session.lastSeenAt, interfaceLocale)}.
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="danger-zone account-danger-zone mt-6">
            <div>
              <h2>{text("Delete account")}</h2>
              <p>
                {text("This removes your login, email, votes, favorites, and sessions. Public content stays under a deleted account.")}
              </p>
            </div>
            <DeleteAccountDialog
              accountName={accountName}
              action={deleteAccountAction}
              labels={{
                cancel: text("Cancel"),
                close: text("Close"),
                confirm: text("Type {name} to confirm.").replace("{name}", accountName),
                description: text("This removes your login, email, votes, favorites, and sessions. Public content stays under a deleted account."),
                title: text("Delete account")
              }}
            />
          </section>
        </>
      )}

      {tab === "notifications" && (
        <section className="panel p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">{text("Notifications")}</h2>
            <p className="muted text-sm">{text("Mute notification types individually.")}</p>
          </div>

          <form action={updateNotificationPreferencesAction} className="grid gap-3">
            {notificationOptions.map((option) => {
              const enabled = notificationPreferenceMap.get(option.type) ?? true;

              return (
                <label key={option.type} className="checkbox-field">
                  <input name="enabledTypes" type="checkbox" value={option.type} defaultChecked={enabled} />
                  <span>
                    <strong>{text(option.title)}</strong>
                    <small>{text(option.description)}</small>
                  </span>
                </label>
              );
            })}
            <button type="submit">{text("Save notification settings")}</button>
          </form>
        </section>
      )}

      {tab === "latex" && (
        <section className="panel p-5">
          <EditorSettingsVisitedMarker />
          <div className="mb-5">
            <h2 className="text-lg font-semibold">{text("Editor")}</h2>
            <p className="muted text-sm">
              {text("Customize the Markdown and LaTeX writing helpers used by Math Woods editors.")}
            </p>
          </div>

          <form action={updateLatexPreferencesAction} className="latex-settings-form">
            <div className="latex-settings-section">
              <div>
                <h3>{text("Markdown shortcuts")}</h3>
                <p>{text("Choose keyboard shortcuts for turning the current line or selection into Markdown headings.")}</p>
              </div>
              <label className="checkbox-field latex-setting-card">
                <input
                  name="markdownHeadingShortcuts"
                  type="checkbox"
                  defaultChecked={Boolean(latexPreferences.markdownHeadingShortcuts)}
                />
                <span>
                  <strong>{text("Enable heading shortcuts")}</strong>
                  <small>{text("Use Ctrl+1 through Ctrl+6 to write # through ###### headings by default.")}</small>
                </span>
              </label>
              <div className="latex-text-grid">
                {markdownHeadingShortcutOptions.map((option) => (
                  <label key={option.name} className="latex-text-field">
                    <span>
                      <strong>{text(option.title)}</strong>
                      <small>{text("Examples: Ctrl+1, Ctrl+Alt+1, Meta+1.")}</small>
                    </span>
                    <input name={option.name} defaultValue={String(latexPreferences[option.name])} />
                  </label>
                ))}
              </div>
            </div>

            {latexToggleSections.map((section) => (
              <div key={section.title} className="latex-settings-section">
                <div>
                  <h3>{text(section.title)}</h3>
                  <p>{text(section.description)}</p>
                </div>
                <div className="latex-settings-grid">
                  {section.options.map((option) => (
                    <label key={option.name} className="checkbox-field latex-setting-card">
                      <input name={option.name} type="checkbox" defaultChecked={Boolean(latexPreferences[option.name])} />
                      <span>
                        <strong>{text(option.title)}</strong>
                        <small>{text(option.description)}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div className="latex-settings-section">
              <div>
                <h3>{text("Block parameters")}</h3>
                <p>{text("Choose the exact LaTeX environments and alignment triggers that shortcuts should use.")}</p>
              </div>
              <div className="latex-text-grid">
                {latexTextOptions.map((option) => (
                  <label key={option.name} className="latex-text-field">
                    <span>
                      <strong>{text(option.title)}</strong>
                      <small>{text(option.description)}</small>
                    </span>
                    <input name={option.name} defaultValue={String(latexPreferences[option.name])} />
                  </label>
                ))}
              </div>
            </div>

            <div className="latex-settings-section">
              <div>
                <h3>{text("Custom commands")}</h3>
                <p>
                  {text("Add personal shorthand commands, one per line. The default format is")}{" "}
                  <code>{text("trigger")} =&gt; {text("replacement")}</code>.
                </p>
              </div>
              <textarea
                name="customCommands"
                className="latex-custom-commands"
                defaultValue={latexPreferences.customCommands}
                spellCheck={false}
              />
            </div>

            <div className="settings-actions">
              <button type="submit">{text("Save editor settings")}</button>
            </div>
          </form>

          <form action={resetLatexPreferencesAction} className="danger-zone mt-5">
            <div>
              <h2>{text("Reset editor settings")}</h2>
              <p>{text("Restore Math Woods defaults for every Markdown shortcut, Latex helper, and custom command.")}</p>
            </div>
            <ConfirmSubmitButton className="danger" message={text("Are you sure you want to reset your editor settings?")}>
              {text("Reset to default")}
            </ConfirmSubmitButton>
          </form>
        </section>
      )}

      {tab === "translations" && translationsDashboard && (
        <section className="panel grid gap-6 p-5">
          <div>
            <h2 className="text-lg font-semibold">{text("Translation health")}</h2>
            <p className="muted text-sm">
              {text("Owner-only view for missing translations and pages that may need a refresh after source edits.")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-line p-3">
              <p className="muted text-xs">{text("Problems")}</p>
              <p className="text-2xl font-semibold">{translationsDashboard.totals.problems}</p>
            </div>
            <div className="rounded-md border border-line p-3">
              <p className="muted text-xs">{text("Concepts")}</p>
              <p className="text-2xl font-semibold">{translationsDashboard.totals.concepts}</p>
            </div>
            <div className="rounded-md border border-line p-3">
              <p className="muted text-xs">{text("Missing groups")}</p>
              <p className="text-2xl font-semibold">{translationsDashboard.totals.withMissingTranslations}</p>
            </div>
            <div className="rounded-md border border-line p-3">
              <p className="muted text-xs">{text("Stale")}</p>
              <p className="text-2xl font-semibold">{translationsDashboard.totals.stale}</p>
            </div>
          </div>

          <div className="grid gap-4">
            <h3 className="font-semibold">{text("Possibly outdated translations")}</h3>
            {translationsDashboard.staleTranslations.length > 0 ? (
              translationsDashboard.staleTranslations.map((item) => (
                <div key={`${item.type}:${item.href}`} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {text(item.type)}: <Link href={item.href as never} className="underline">{item.title}</Link>
                      </p>
                      <p className="muted">
                        {contentLanguageLabel(item.language)} / {text("based on revision")} {item.basedOnRevisionId}, {text("source now revision")}{" "}
                        {item.latestRevisionId}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={item.editHref as never} className="button">
                        {text("Update translation")}
                      </Link>
                      <Link href={item.sourceHref as never} className="button secondary">
                        {text("Source")}
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted rounded-md border border-line p-3 text-sm">{text("No stale translations detected.")}</p>
            )}
          </div>

          <div className="grid gap-4">
            <h3 className="font-semibold">{text("Missing translations")}</h3>
            {translationsDashboard.gaps.length > 0 ? (
              translationsDashboard.gaps.map((gap) => (
                <div key={`${gap.type}:${gap.href}`} className="rounded-md border border-line p-3 text-sm">
                  <p className="font-medium">
                    {text(gap.type)}: <Link href={gap.href as never} className="underline">{gap.title}</Link>
                  </p>
                  <p className="muted">{text("Existing")}: {gap.existingLanguages.map(contentLanguageLabel).join(", ")}</p>
                  <p className="muted">{text("Missing")}: {gap.missingLanguages.join(", ")}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {gap.missingLanguageLinks.map((link) => (
                      <Link key={link.href} href={link.href as never} className="button secondary">
                        {text("Translate to")} {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="muted rounded-md border border-line p-3 text-sm">{text("No missing translations detected.")}</p>
            )}
          </div>
        </section>
      )}

      {tab === "admin" && canManageRoles && (
        <section className="panel p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">{text("User roles")}</h2>
            <p className="muted text-sm">
              {text("Deactivation is reversible and keeps the account's email and connected sign-in identities reserved.")}
            </p>
          </div>

          <nav className="tab-nav mb-4" aria-label={text("Admin user sections")}>
            <Link href="/settings?tab=admin" className={adminUsersTab === "active" ? "active" : ""}>
              {text("Active users")} ({activeUsers.length})
            </Link>
            <Link
              href="/settings?tab=admin&adminUsers=deleted"
              className={adminUsersTab === "deleted" ? "active" : ""}
            >
              {text("Deactivated users")} ({deletedUsers.length})
            </Link>
          </nav>

          <div className="grid gap-3">
            {shownAdminUsers.map((managedUser) => {
              const deleted = isDeletedUser(managedUser);
              const assignableRoles = deleted
                ? []
                : assignableRolesFor(user.role).filter((role) => canAssignRole(user, managedUser, role));
              const lockedRole = assignableRoles.length === 0;
              const canMove = managedUser.id !== user.id && managedUser.role !== Role.OWNER;
              const discoverySource = parseUserDiscoverySource(managedUser.discoverySource);

              return (
                <div key={managedUser.id} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium"><UserName user={managedUser} /></p>
                      <p className="muted">
                        {text(roleLabel(managedUser.role))} / {text("joined")} {formatDate(managedUser.createdAt, interfaceLocale)}
                        {managedUser.deletedAt && <> / {text("deleted")} {formatDate(managedUser.deletedAt, interfaceLocale)}</>}
                      </p>
                      {discoverySource && (
                        <p className="muted mt-1">
                          {t.profile.discoverySourceAdmin}: {t.profile.discoverySources[discoverySource]}
                          {managedUser.discoverySourceDetail ? ` (${managedUser.discoverySourceDetail})` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {lockedRole ? (
                        <span className="tag">{text(deleted ? "Deactivated" : roleLabel(managedUser.role))}</span>
                      ) : (
                        <form action={updateUserRoleAction.bind(null, managedUser.id)} className="flex flex-wrap gap-2">
                          <select name="role" defaultValue={managedUser.role} aria-label={`${text("Role for")} ${managedUser.username}`}>
                            {assignableRoles.map((role) => (
                              <option key={role} value={role}>
                                {text(roleLabel(role))}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="secondary">
                            {text("Update")}
                          </button>
                        </form>
                      )}
                      {canMove && (
                        <form
                          action={updateUserDeletedStatusAction.bind(null, managedUser.id, deleted ? "active" : "deleted")}
                        >
                          <button type="submit" className="secondary">
                            {text(deleted ? "Reactivate" : "Deactivate")}
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {shownAdminUsers.length === 0 && (
              <p className="muted rounded-md border border-line p-3 text-sm">
                {text(adminUsersTab === "deleted" ? "No deactivated users." : "No active users.")}
              </p>
            )}
          </div>
        </section>
      )}
    </ForestPageLayout>
  );
}
