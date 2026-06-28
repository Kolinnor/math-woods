import { NotificationType } from "@prisma/client";
import Link from "next/link";
import { BackgroundStylePicker } from "@/components/BackgroundStylePicker";
import {
  changePasswordAction,
  deleteAccountAction,
  resendEmailVerificationAction,
  revokeOtherSessionsAction,
  updateUserRoleAction
} from "@/lib/actions/account-actions";
import { resetLatexPreferencesAction, updateLatexPreferencesAction } from "@/lib/actions/latex-preference-actions";
import { updateNotificationPreferencesAction } from "@/lib/actions/notification-actions";
import { getCurrentSession, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { mailStatusLabel } from "@/lib/email-verification";
import { mergeLatexPreferences, type LatexPreferenceValues } from "@/lib/latex-preferences";
import { ASSIGNABLE_ROLES, isOwner, roleLabel } from "@/lib/roles";
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

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: Promise<{ tab?: string; updated?: string; verify?: string; deleteAccount?: string }>;
}) {
  const user = await requireUser();
  const currentSession = await getCurrentSession();
  const params = searchParams ? await searchParams : {};
  const tab =
    params.tab === "notifications" || params.tab === "admin" || params.tab === "latex" ? params.tab : "account";
  const verifyStatus = params.verify;
  const canManageRoles = isOwner(user.role);
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
        select: { id: true, username: true, displayName: true, email: true, role: true, createdAt: true }
      })
    : [];

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="muted mt-1">Appearance, account security, and active sessions for {displayNameForUser(user)}.</p>
      </div>

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
      {params.updated === "notifications" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          Notification preferences updated.
        </p>
      )}
      {params.updated === "latex" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          LaTeX preferences updated.
        </p>
      )}
      {params.updated === "latex-reset" && (
        <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">
          LaTeX preferences reset to default.
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
          Latex
        </Link>
        {canManageRoles && (
          <Link href="/settings?tab=admin" className={tab === "admin" ? "active" : ""}>
            Admin
          </Link>
        )}
      </nav>

      {tab === "account" && (
        <>
          <section className="panel p-5">
            <BackgroundStylePicker />
          </section>

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
                This removes your login, email, private notes, votes, favorites, and sessions. Public content stays
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
            <h2 className="text-lg font-semibold">Latex</h2>
            <p className="muted text-sm">
              Customize the LaTeX writing helpers used by Math Woods editors. Some options are saved now and will be
              wired into richer editor behavior progressively.
            </p>
          </div>

          <form action={updateLatexPreferencesAction} className="latex-settings-form">
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
              <button type="submit">Save Latex settings</button>
            </div>
          </form>

          <form action={resetLatexPreferencesAction} className="danger-zone mt-5">
            <div>
              <h2>Reset Latex settings</h2>
              <p>Restore Math Woods defaults for every Latex helper and custom command.</p>
            </div>
            <ConfirmSubmitButton className="danger" message="Are you sure you want to reset your Latex settings?">
              Reset to default
            </ConfirmSubmitButton>
          </form>
        </section>
      )}

      {tab === "admin" && canManageRoles && (
        <section className="panel p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">User roles</h2>
            <p className="muted text-sm">Only the owner can assign moderator and admin roles.</p>
          </div>

          <div className="grid gap-3">
            {roleUsers.map((managedUser) => {
              const lockedOwner = managedUser.role === "OWNER";

              return (
                <div key={managedUser.id} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{displayNameForUser(managedUser)}</p>
                      <p className="muted">
                        {roleLabel(managedUser.role)} / joined {formatDate(managedUser.createdAt)}
                      </p>
                    </div>
                    {lockedOwner ? (
                      <span className="tag">{roleLabel(managedUser.role)}</span>
                    ) : (
                      <form action={updateUserRoleAction.bind(null, managedUser.id)} className="flex flex-wrap gap-2">
                        <select name="role" defaultValue={managedUser.role} aria-label={`Role for ${managedUser.username}`}>
                          {ASSIGNABLE_ROLES.map((role) => (
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
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
