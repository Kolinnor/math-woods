import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Menu, Search } from "lucide-react";
import { cookies } from "next/headers";
import "./globals.css";
import { AchievementToast } from "@/components/AchievementToast";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { ErrorReporter } from "@/components/ErrorReporter";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { LanguageSelector } from "@/components/LanguageSelector";
import { NotificationsMenu } from "@/components/NotificationsMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TimeZoneReporter } from "@/components/TimeZoneReporter";
import { resendEmailVerificationAction } from "@/lib/actions/account-actions";
import { logoutAction } from "@/lib/actions/auth-actions";
import { getCurrentUser } from "@/lib/auth";
import { CONTENT_LANGUAGE_COOKIE, parseContentLanguage } from "@/lib/languages";
import { canUseModerationTools } from "@/lib/permissions";
import { displayNameForUser } from "@/lib/user-display";

export const metadata: Metadata = {
  title: "Math Woods",
  description: "A free, ad-free place for math problems, linked concepts, and opt-in discussions.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  }
};

const appearanceBootScript = `
try {
  var root = document.documentElement;
  var validThemes = { light: true, dim: true, dark: true };
  var validBackgrounds = { plain: true, green: true, paper: true, contours: true };
  var validTones = { sage: true, amber: true, blue: true, rose: true };
  var cookieValue = function (name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  };
  var setCookie = function (name, value) {
    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      "; max-age=31536000; path=/; samesite=lax" +
      (location.protocol === "https:" ? "; secure" : "");
  };
  var theme =
    localStorage.getItem("math-woods-theme") ||
    cookieValue("math-woods-theme") ||
    localStorage.getItem("math-hills-theme") ||
    localStorage.getItem("math-garden-theme");
  var background =
    localStorage.getItem("math-woods-background") ||
    cookieValue("math-woods-background") ||
    localStorage.getItem("math-hills-background");
  var tone =
    localStorage.getItem("math-woods-background-tone") ||
    cookieValue("math-woods-background-tone") ||
    localStorage.getItem("math-hills-background-tone");

  theme = validThemes[theme] ? theme : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  background = validBackgrounds[background] ? background : "green";
  tone = validTones[tone] ? tone : "sage";

  root.dataset.theme = theme;
  root.dataset.background = background;
  root.dataset.backgroundTone = tone;

  localStorage.setItem("math-woods-theme", theme);
  localStorage.setItem("math-woods-background", background);
  localStorage.setItem("math-woods-background-tone", tone);
  setCookie("math-woods-theme", theme);
  setCookie("math-woods-background", background);
  setCookie("math-woods-background-tone", tone);
  localStorage.removeItem("math-hills-theme");
  localStorage.removeItem("math-garden-theme");
  localStorage.removeItem("math-hills-background");
  localStorage.removeItem("math-hills-background-tone");
} catch (error) {}
`;

const usersRoute = "/users" as Route;

function validTheme(value: string | undefined) {
  return value === "light" || value === "dim" || value === "dark" ? value : undefined;
}

function validBackground(value: string | undefined) {
  return value === "plain" || value === "green" || value === "paper" || value === "contours" ? value : undefined;
}

function validBackgroundTone(value: string | undefined) {
  return value === "sage" || value === "amber" || value === "blue" || value === "rose" ? value : undefined;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const cookieStore = await cookies();
  const initialTheme = validTheme(cookieStore.get("math-woods-theme")?.value);
  const initialBackground = validBackground(cookieStore.get("math-woods-background")?.value) ?? "green";
  const initialBackgroundTone = validBackgroundTone(cookieStore.get("math-woods-background-tone")?.value) ?? "sage";
  const initialLanguage = parseContentLanguage(cookieStore.get(CONTENT_LANGUAGE_COOKIE)?.value);
  const needsEmailVerification = Boolean(user && !user.emailVerifiedAt && !canUseModerationTools(user));

  return (
    <html
      lang={initialLanguage}
      data-theme={initialTheme}
      data-background={initialBackground}
      data-background-tone={initialBackgroundTone}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: appearanceBootScript
          }}
        />
      </head>
      <body>
        <ErrorReporter />
        <TimeZoneReporter />
        <header className="site-header">
          <nav className="site-nav mx-auto max-w-6xl px-4">
            <Link href="/" className="site-brand" aria-label="Math Woods home">
              <img src="/icon.svg" alt="" className="site-brand-logo" aria-hidden="true" />
              <span>Math Woods</span>
            </Link>
            <div className="primary-nav">
              <Link href="/problems">Problems</Link>
              <Link href="/concepts">Concepts</Link>
              <Link href="/playlists">Playlists</Link>
              <Link href="/tips">Tips</Link>
              <Link href={usersRoute}>Users</Link>
              <Link href="/competition">Competition</Link>
            </div>
            <div className="nav-tools">
              <LanguageSelector initialLanguage={initialLanguage} />
              <LiveSearchForm action="/search" className="header-search">
                <Search size={16} aria-hidden="true" />
                <input name="q" aria-label="Search Math Woods" placeholder="Search" />
              </LiveSearchForm>
              {user && <NotificationsMenu userId={user.id} />}
              <ThemeToggle />
              <details className="nav-menu">
                <summary aria-label="Open navigation menu" title="More">
                  <Menu size={18} />
                </summary>
                <div className="nav-menu-popover">
                  <Link href="/recent-changes">Recent changes</Link>
                  <Link href="/contributing">Contributing</Link>
                  <Link href="/suggestions">Suggestions</Link>
                  <Link href="/about">About</Link>
                  {user && <div className="nav-menu-divider" />}
                  {user && <Link href="/me">My work</Link>}
                  {user && <Link href={`/profile/${user.username}`}>{displayNameForUser(user)}</Link>}
                  {user && <Link href="/settings">Settings</Link>}
                  {user && canUseModerationTools(user) && <Link href="/moderation">Moderation</Link>}
                  {user ? (
                    <form action={logoutAction}>
                      <button className="nav-menu-action" type="submit">
                        Sign out
                      </button>
                    </form>
                  ) : (
                    <Link href="/login" className="nav-menu-action">
                      Sign in
                    </Link>
                  )}
                </div>
              </details>
            </div>
          </nav>
          {needsEmailVerification && user && (
            <EmailVerificationBanner userId={user.id} resendAction={resendEmailVerificationAction} />
          )}
        </header>
        {user && <AchievementToast userId={user.id} />}
        <main className="site-main mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="site-footer">
          <div className="mx-auto grid max-w-6xl gap-3 px-4 py-6 text-sm md:grid-cols-[1fr_auto] md:items-center">
            <p>
              Code: AGPL-3.0-or-later. Educational content: CC BY-NC-SA 4.0 unless otherwise stated. Math Woods name,
              logo, domain, and visual identity are protected brand assets.
            </p>
            <div className="flex gap-4">
              <Link href="/about">About</Link>
              <Link href="/suggestions">Suggestions</Link>
              <Link href="/contributing">Contribute</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
