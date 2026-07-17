import { NotificationType, Role } from "@prisma/client";
import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
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
import { getCurrentSession, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { mailStatusLabel } from "@/lib/email-verification";
import { mergeLatexPreferences, type LatexPreferenceValues } from "@/lib/latex-preferences";
import { contentLanguageLabel } from "@/lib/languages";
import { assignableRolesFor, canAssignRole, canManageUserRoles, canUseOwnerTools } from "@/lib/permissions";
import { roleLabel } from "@/lib/roles";
import { translationDashboard } from "@/lib/translation-dashboard";
import { displayNameForUser } from "@/lib/user-display";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
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
    type: NotificationType.EXPLORATION_PUBLISHED,
    title: "New exploration editions",
    description: "When an exploration you follow publishes a new edition."
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
  }>;
}) {
  const user = await requireUser();
  const currentSession = await getCurrentSession();
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
  const [sessions, notificationPreferences, savedLatexPreferences] = await Promise.all([
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
    })
  ]);
  const latexPreferences = mergeLatexPreferences(savedLatexPreferences);
  const notificationPreferenceMap = new Map(
    notificationPreferences.map((preference) => [preference.type, preference.enabled])
  );
  const accountName = displayNameForUser(user);
  const roleUsers = canManageRoles
    ? await prisma.user.findMany({
        orderBy: [{ role: "desc" }, { username: "asc" }],
        select: { id: true, username: true, displayName: true, email: true, role: true, createdAt: true, deletedAt: true }
      })
    : [];
  const activeUsers = roleUsers.filter((managedUser) => !isDeletedUser(managedUser));
  const deletedUsers = roleUsers.filter(isDeletedUser);
  const shownAdminUsers = adminUsersTab === "deleted" ? deletedUsers : activeUsers;
  const translationsDashboard = tab === "translations" ? await translationDashboard() : null;

  return (
    <ForestPageLayout
      title="Settings"
      eyebrow="Account"
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      description={`Appearance, account security, and active sessions for ${displayNameForUser(user)}.`}
      workspaceClassName="forest-page-workspace-narrow"
    >
      {params.updated === "password" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          Password updated. Other sessions were revoked.
        </p>
      )}
      {params.updated === "sessions" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          Other sessions were revoked.
        </p>
      )}
      {params.updated === "role" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          User role updated.
        </p>
      )}
      {params.updated === "user-status" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          User status updated.
        </p>
      )}
      {params.updated === "notifications" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          Notification preferences updated.
        </p>
      )}
      {params.updated === "latex" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          Editor preferences updated.
        </p>
      )}
      {params.updated === "latex-reset" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          Editor preferences reset to default.
        </p>
      )}
      {params.deleteAccount === "confirm" && (
        <p className="panel border-amber-700 bg-amber-50 p-4 text-sm text-amber-950">
          Type your account name exactly to delete your account.
        </p>
      )}
      {params.deleteAccount === "owner" && (
        <p className="panel border-amber-700 bg-amber-50 p-4 text-sm text-amber-950">
          The owner account cannot be deleted here.
        </p>
      )}
      {verifyStatus === "sent" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          Verification email sent.
        </p>
      )}
      {verifyStatus === "required" && (
        <p className="panel border-amber-700 bg-amber-50 p-4 text-sm text-amber-950">
          Verify your email to unlock contributions.
        </p>
      )}
      {verifyStatus === "rate-limited" && (
        <p className="panel border-amber-700 bg-amber-50 p-4 text-sm text-amber-950">
          Too many requests. Please try again later.
        </p>
      )}
      {(verifyStatus === "not-configured" || verifyStatus === "send-failed") && (
        <p className="panel border-amber-700 bg-amber-50 p-4 text-sm text-amber-950">
          Verification email could not be sent yet.
        </p>
      )}
      {verifyStatus === "already-verified" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          Your email is already verified.
        </p>
      )}

      <nav className="tab-nav" aria-label="Settings sections">
        <Link href="/settings" className={tab === "account" ? "active" : ""}>
          Account
        </Link>
        <Link href="/settings?tab=notifications" className={tab === "notifications" ? "active" : ""}>
          Notifications
        </Link>
        <Link href="/settings?tab=latex" className={tab === "latex" ? "active" : ""}>
          Editor
        </Link>
        {canManageRoles && (
          <Link href="/settings?tab=admin" className={tab === "admin" ? "active" : ""}>
            Admin
          </Link>
        )}
        {canUseTranslationsDashboard && (
          <Link href="/settings?tab=translations" className={tab === "translations" ? "active" : ""}>
            Translations
          </Link>
        )}
      </nav>

      {tab === "account" && (
        <>
          <section className="panel p-5">
            <h2 className="mb-2 text-lg font-semibold">Email verification</h2>
            {user.emailVerifiedAt ? (
              <p className="text-sm">
                <strong>{user.email}</strong> is verified.
              </p>
            ) : (
              <div className="grid gap-3">
                <p className="muted text-sm">
                  Verify <strong>{user.email}</strong> to unlock contributions.
                </p>
                <p className="muted text-xs">{mailStatusLabel()}</p>
                <form action={resendEmailVerificationAction}>
                  <button type="submit" className="secondary">
                    Resend verification email
                  </button>
                </form>
              </div>
            )}
          </section>

          <section className="panel p-5">
            <h2 className="mb-4 text-lg font-semibold">Change password</h2>
            <form action={changePasswordAction} className="grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-medium">Current password</span>
                <input name="currentPassword" type="password" required />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium">New password</span>
                <input name="newPassword" type="password" minLength={8} required />
              </label>
              <button type="submit">Update password</button>
            </form>
          </section>

          <section className="panel p-5">
            <h2 className="mb-2 text-lg font-semibold">Data tools</h2>
            <p className="muted mb-4 text-sm">
              Bring Markdown notes into Math Woods. Problem and concept pages can be exported individually.
            </p>
            <Link href="/import" className="button secondary">
              Import Markdown
            </Link>
          </section>

          <section className="panel p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Active sessions</h2>
                <p className="muted text-sm">Sessions expire after 30 days.</p>
              </div>
              <form action={revokeOtherSessionsAction}>
                <button type="submit" className="secondary">
                  Revoke others
                </button>
              </form>
            </div>

            <div className="grid gap-3">
              {sessions.map((session) => (
                <div key={session.id} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {session.id === currentSession?.id ? "Current session" : "Signed-in session"}
                    </span>
                    <span className="muted">Expires {formatDate(session.expiresAt)}</span>
                  </div>
                  <p className="muted mt-1">
                    Created {formatDate(session.createdAt)}. Last seen {formatDate(session.lastSeenAt)}.
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="danger-zone account-danger-zone mt-6">
            <div>
              <h2>Delete account</h2>
              <p>
                This removes your login, email, votes, favorites, and sessions. Public content stays
                under a deleted account.
              </p>
            </div>
            <DeleteAccountDialog accountName={accountName} action={deleteAccountAction} />
          </section>
        </>
      )}

      {tab === "notifications" && (
        <section className="panel p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Notifications</h2>
            <p className="muted text-sm">Mute notification types individually.</p>
          </div>

          <form action={updateNotificationPreferencesAction} className="grid gap-3">
            {notificationOptions.map((option) => {
              const enabled = notificationPreferenceMap.get(option.type) ?? true;

              return (
                <label key={option.type} className="checkbox-field">
                  <input name="enabledTypes" type="checkbox" value={option.type} defaultChecked={enabled} />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              );
            })}
            <button type="submit">Save notification settings</button>
          </form>
        </section>
      )}

      {tab === "latex" && (
        <section className="panel p-5">
          <div className="mb-5">
            <h2 className="text-lg font-semibold">Editor</h2>
            <p className="muted text-sm">
              Customize the Markdown and LaTeX writing helpers used by Math Woods editors.
            </p>
          </div>

          <form action={updateLatexPreferencesAction} className="latex-settings-form">
            <div className="latex-settings-section">
              <div>
                <h3>Markdown shortcuts</h3>
                <p>Choose keyboard shortcuts for turning the current line or selection into Markdown headings.</p>
              </div>
              <label className="checkbox-field latex-setting-card">
                <input
                  name="markdownHeadingShortcuts"
                  type="checkbox"
                  defaultChecked={Boolean(latexPreferences.markdownHeadingShortcuts)}
                />
                <span>
                  <strong>Enable heading shortcuts</strong>
                  <small>Use shortcuts such as Shift+1 through Shift+6 to write # through ###### headings.</small>
                </span>
              </label>
              <div className="latex-text-grid">
                {markdownHeadingShortcutOptions.map((option) => (
                  <label key={option.name} className="latex-text-field">
                    <span>
                      <strong>{option.title}</strong>
                      <small>Examples: Shift+1, Ctrl+Alt+1, Meta+1.</small>
                    </span>
                    <input name={option.name} defaultValue={String(latexPreferences[option.name])} />
                  </label>
                ))}
              </div>
            </div>

            {latexToggleSections.map((section) => (
              <div key={section.title} className="latex-settings-section">
                <div>
                  <h3>{section.title}</h3>
                  <p>{section.description}</p>
                </div>
                <div className="latex-settings-grid">
                  {section.options.map((option) => (
                    <label key={option.name} className="checkbox-field latex-setting-card">
                      <input name={option.name} type="checkbox" defaultChecked={Boolean(latexPreferences[option.name])} />
                      <span>
                        <strong>{option.title}</strong>
                        <small>{option.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div className="latex-settings-section">
              <div>
                <h3>Block parameters</h3>
                <p>Choose the exact LaTeX environments and alignment triggers that shortcuts should use.</p>
              </div>
              <div className="latex-text-grid">
                {latexTextOptions.map((option) => (
                  <label key={option.name} className="latex-text-field">
                    <span>
                      <strong>{option.title}</strong>
                      <small>{option.description}</small>
                    </span>
                    <input name={option.name} defaultValue={String(latexPreferences[option.name])} />
                  </label>
                ))}
              </div>
            </div>

            <div className="latex-settings-section">
              <div>
                <h3>Custom commands</h3>
                <p>
                  Add personal shorthand commands, one per line. The default format is{" "}
                  <code>trigger =&gt; replacement</code>.
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
              <button type="submit">Save editor settings</button>
            </div>
          </form>

          <form action={resetLatexPreferencesAction} className="danger-zone mt-5">
            <div>
              <h2>Reset editor settings</h2>
              <p>Restore Math Woods defaults for every Markdown shortcut, Latex helper, and custom command.</p>
            </div>
            <ConfirmSubmitButton className="danger" message="Are you sure you want to reset your editor settings?">
              Reset to default
            </ConfirmSubmitButton>
          </form>
        </section>
      )}

      {tab === "translations" && translationsDashboard && (
        <section className="panel grid gap-6 p-5">
          <div>
            <h2 className="text-lg font-semibold">Translation health</h2>
            <p className="muted text-sm">
              Owner-only view for missing translations and pages that may need a refresh after source edits.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-line p-3">
              <p className="muted text-xs">Problems</p>
              <p className="text-2xl font-semibold">{translationsDashboard.totals.problems}</p>
            </div>
            <div className="rounded-md border border-line p-3">
              <p className="muted text-xs">Concepts</p>
              <p className="text-2xl font-semibold">{translationsDashboard.totals.concepts}</p>
            </div>
            <div className="rounded-md border border-line p-3">
              <p className="muted text-xs">Missing groups</p>
              <p className="text-2xl font-semibold">{translationsDashboard.totals.withMissingTranslations}</p>
            </div>
            <div className="rounded-md border border-line p-3">
              <p className="muted text-xs">Stale</p>
              <p className="text-2xl font-semibold">{translationsDashboard.totals.stale}</p>
            </div>
          </div>

          <div className="grid gap-4">
            <h3 className="font-semibold">Possibly outdated translations</h3>
            {translationsDashboard.staleTranslations.length > 0 ? (
              translationsDashboard.staleTranslations.map((item) => (
                <div key={`${item.type}:${item.href}`} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {item.type}: <Link href={item.href as never} className="underline">{item.title}</Link>
                      </p>
                      <p className="muted">
                        {contentLanguageLabel(item.language)} / based on revision {item.basedOnRevisionId}, source now revision{" "}
                        {item.latestRevisionId}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={item.editHref as never} className="button">
                        Update translation
                      </Link>
                      <Link href={item.sourceHref as never} className="button secondary">
                        Source
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted rounded-md border border-line p-3 text-sm">No stale translations detected.</p>
            )}
          </div>

          <div className="grid gap-4">
            <h3 className="font-semibold">Missing translations</h3>
            {translationsDashboard.gaps.length > 0 ? (
              translationsDashboard.gaps.map((gap) => (
                <div key={`${gap.type}:${gap.href}`} className="rounded-md border border-line p-3 text-sm">
                  <p className="font-medium">
                    {gap.type}: <Link href={gap.href as never} className="underline">{gap.title}</Link>
                  </p>
                  <p className="muted">Existing: {gap.existingLanguages.map(contentLanguageLabel).join(", ")}</p>
                  <p className="muted">Missing: {gap.missingLanguages.join(", ")}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {gap.missingLanguageLinks.map((link) => (
                      <Link key={link.href} href={link.href as never} className="button secondary">
                        Translate to {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="muted rounded-md border border-line p-3 text-sm">No missing translations detected.</p>
            )}
          </div>
        </section>
      )}

      {tab === "admin" && canManageRoles && (
        <section className="panel p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">User roles</h2>
            <p className="muted text-sm">Only the owner can manage trusted users and deleted-user visibility.</p>
          </div>

          <nav className="tab-nav mb-4" aria-label="Admin user sections">
            <Link href="/settings?tab=admin" className={adminUsersTab === "active" ? "active" : ""}>
              Active users ({activeUsers.length})
            </Link>
            <Link
              href="/settings?tab=admin&adminUsers=deleted"
              className={adminUsersTab === "deleted" ? "active" : ""}
            >
              Deleted users ({deletedUsers.length})
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

              return (
                <div key={managedUser.id} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{displayNameForUser(managedUser)}</p>
                      <p className="muted">
                        {roleLabel(managedUser.role)} / joined {formatDate(managedUser.createdAt)}
                        {managedUser.deletedAt && <> / deleted {formatDate(managedUser.deletedAt)}</>}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {lockedRole ? (
                        <span className="tag">{deleted ? "Deleted user" : roleLabel(managedUser.role)}</span>
                      ) : (
                        <form action={updateUserRoleAction.bind(null, managedUser.id)} className="flex flex-wrap gap-2">
                          <select name="role" defaultValue={managedUser.role} aria-label={`Role for ${managedUser.username}`}>
                            {assignableRoles.map((role) => (
                              <option key={role} value={role}>
                                {roleLabel(role)}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="secondary">
                            Update
                          </button>
                        </form>
                      )}
                      {canMove && (
                        <form
                          action={updateUserDeletedStatusAction.bind(null, managedUser.id, deleted ? "active" : "deleted")}
                        >
                          <button type="submit" className="secondary">
                            {deleted ? "Move to active" : "Move to deleted"}
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
                {adminUsersTab === "deleted" ? "No deleted users." : "No active users."}
              </p>
            )}
          </div>
        </section>
      )}
    </ForestPageLayout>
  );
}
