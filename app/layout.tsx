import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Inter, Spectral } from "next/font/google";
import { Menu } from "lucide-react";
import { cookies } from "next/headers";
import "../node_modules/jsxgraph/distrib/jsxgraph.css";
import "./globals.css";
import { AchievementToast } from "@/components/AchievementToast";
import { AutoClosingDetails } from "@/components/AutoClosingDetails";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { ErrorReporter } from "@/components/ErrorReporter";
import { FriendsMenu } from "@/components/FriendsMenu";
import { GuestProgressPrompt } from "@/components/GuestProgressPrompt";
import { LanguageSelector } from "@/components/LanguageSelector";
import { NotificationsMenu } from "@/components/NotificationsMenu";
import { TimeZoneReporter } from "@/components/TimeZoneReporter";
import { resendEmailVerificationAction } from "@/lib/actions/account-actions";
import { logoutAction } from "@/lib/actions/auth-actions";
import { getCurrentUser } from "@/lib/auth";
import { dictionaryForContentLanguage } from "@/lib/i18n/server";
import { CONTENT_LANGUAGE_COOKIE, parseContentLanguage } from "@/lib/languages";
import { canUseAdminTools, canUseModerationTools } from "@/lib/permissions";
import { displayNameForUser } from "@/lib/user-display";

export const metadata: Metadata = {
  metadataBase: new URL("https://mathwoods.org"),
  title: "Math Woods",
  description: "A quiet place for people who enjoy solving mathematics problems.",
  openGraph: {
    title: "Math Woods",
    description: "A quiet place for people who enjoy solving mathematics problems.",
    url: "https://mathwoods.org",
    siteName: "Math Woods",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Math Woods",
    description: "A quiet place for people who enjoy solving mathematics problems."
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  }
};

const appearanceBootScript = `
try {
  var root = document.documentElement;
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
  var background =
    localStorage.getItem("math-woods-background") ||
    cookieValue("math-woods-background") ||
    localStorage.getItem("math-hills-background");
  var tone =
    localStorage.getItem("math-woods-background-tone") ||
    cookieValue("math-woods-background-tone") ||
    localStorage.getItem("math-hills-background-tone");

  background = validBackgrounds[background] ? background : "green";
  tone = validTones[tone] ? tone : "sage";

  root.dataset.theme = "light";
  root.dataset.background = background;
  root.dataset.backgroundTone = tone;

  localStorage.setItem("math-woods-theme", "light");
  localStorage.setItem("math-woods-background", background);
  localStorage.setItem("math-woods-background-tone", tone);
  setCookie("math-woods-theme", "light");
  setCookie("math-woods-background", background);
  setCookie("math-woods-background-tone", tone);
  localStorage.removeItem("math-hills-theme");
  localStorage.removeItem("math-garden-theme");
  localStorage.removeItem("math-hills-background");
  localStorage.removeItem("math-hills-background-tone");
} catch (error) {}
`;

const usersRoute = "/users" as Route;

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans"
});

const spectral = Spectral({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-serif"
});

function validBackground(value: string | undefined) {
  return value === "plain" || value === "green" || value === "paper" || value === "contours" ? value : undefined;
}

function validBackgroundTone(value: string | undefined) {
  return value === "sage" || value === "amber" || value === "blue" || value === "rose" ? value : undefined;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const cookieStore = await cookies();
  const initialBackground = validBackground(cookieStore.get("math-woods-background")?.value) ?? "green";
  const initialBackgroundTone = validBackgroundTone(cookieStore.get("math-woods-background-tone")?.value) ?? "sage";
  const initialLanguage = parseContentLanguage(cookieStore.get(CONTENT_LANGUAGE_COOKIE)?.value);
  const t = dictionaryForContentLanguage(initialLanguage);
  const needsEmailVerification = Boolean(user && !user.emailVerifiedAt && !canUseModerationTools(user));

  return (
    <html
      lang={initialLanguage}
      data-theme="light"
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
      <body className={`${inter.variable} ${spectral.variable}`}>
        <ErrorReporter />
        <TimeZoneReporter />
        <header className="site-header">
          <nav className="site-nav mx-auto max-w-6xl px-4">
            <Link href="/" className="site-brand" aria-label={t.nav.homeAriaLabel}>
              <img src="/icon.svg" alt="" className="site-brand-logo" aria-hidden="true" />
              <span>Math Woods</span>
            </Link>
            <div className="primary-nav">
              <Link href="/problems">{t.nav.problems}</Link>
              <Link href="/concepts">{t.nav.concepts}</Link>
              <Link href={"/explorations" as Route}>{t.nav.playlists}</Link>
              {user && canUseAdminTools(user) && <Link href="/tips">{t.nav.tips}</Link>}
              <Link href={usersRoute}>{t.nav.users}</Link>
            </div>
            <div className="nav-tools">
              <LanguageSelector initialLanguage={initialLanguage} />
              {user && <NotificationsMenu userId={user.id} />}
              <AutoClosingDetails className="nav-menu">
                <summary aria-label={t.nav.moreAriaLabel} title={t.nav.moreTitle}>
                  <Menu size={18} />
                </summary>
                <div className="nav-menu-popover">
                  <Link href="/recent-changes">{t.nav.recentChanges}</Link>
                  {user && canUseAdminTools(user) && <Link href="/contributing">{t.nav.contributing}</Link>}
                  <Link href="/suggestions">{t.nav.suggestions}</Link>
                  <Link href="/about">{t.nav.about}</Link>
                  {user && <div className="nav-menu-divider" />}
                  {user && <Link href={`/profile/${user.username}`}>{displayNameForUser(user)}</Link>}
                  {user && <Link href={"/friends" as never}>{t.nav.friends}</Link>}
                  {user && <Link href="/settings">{t.nav.settings}</Link>}
                  {user && canUseModerationTools(user) && <Link href="/moderation">{t.nav.moderation}</Link>}
                  {user ? (
                    <form action={logoutAction}>
                      <button className="nav-menu-action" type="submit">
                        {t.nav.signOut}
                      </button>
                    </form>
                  ) : (
                    <Link href="/login" className="nav-menu-action">
                      {t.nav.signIn}
                    </Link>
                  )}
                </div>
              </AutoClosingDetails>
            </div>
          </nav>
          {needsEmailVerification && user && (
            <EmailVerificationBanner userId={user.id} resendAction={resendEmailVerificationAction} />
          )}
        </header>
        {!user && <GuestProgressPrompt />}
        {user && <AchievementToast userId={user.id} />}
        {user && (
          <div className="floating-friends-menu">
            <FriendsMenu userId={user.id} />
          </div>
        )}
        <main className="site-main mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="site-footer">
          <div className="mx-auto grid max-w-6xl gap-3 px-4 py-6 text-sm md:grid-cols-[1fr_auto] md:items-center">
            <p>{t.footer.legal}</p>
            <div className="flex gap-4">
              <Link href="/about">{t.footer.about}</Link>
              <Link href="/suggestions">{t.footer.suggestions}</Link>
              <Link href="/contributing">{t.footer.contribute}</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
