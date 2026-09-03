import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import localFont from "next/font/local";
import { Github, Menu } from "lucide-react";
import { cookies } from "next/headers";
import "../node_modules/jsxgraph/distrib/jsxgraph.css";
import "./globals.css";
import "./styles/10-reading-recommendations.css";
import "./styles/11-public-home.css";
import "./styles/12-layout-compatibility.css";
import "./styles/20-exploration-reader.css";
import "./styles/21-exploration-studio.css";
import "./styles/30-site-header.css";
import "./styles/31-mobile-baseline.css";
import "./styles/40-content-browsers.css";
import "./styles/50-weekly-contest.css";
import "./styles/61-reading-bridge.css";
import "./styles/62-dashboard-tip.css";
import "./styles/63-layout-overrides.css";
import "./styles/64-problems.css";
import "./styles/65-concepts.css";
import "./styles/66-community.css";
import "./styles/67-contributions.css";
import "./styles/70-discussions.css";
import "./styles/80-guided-tour.css";
import "./styles/90-resume-banner.css";
import "./styles/91-mobile-density.css";
import "./styles/92-announcements.css";
import "./styles/93-daily-problem-history.css";
import "./styles/94-particle-burst.css";
import { AchievementToast } from "@/components/AchievementToast";
import { AutoClosingDetails } from "@/components/AutoClosingDetails";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { ErrorReporter } from "@/components/ErrorReporter";
import { FriendsMenu } from "@/components/FriendsMenu";
import { GuestProgressPrompt } from "@/components/GuestProgressPrompt";
import { LanguageSelector } from "@/components/LanguageSelector";
import { MathWoodsTourOverlay } from "@/components/MathWoodsTourOverlay";
import { MarkdownEditorLabelsProvider } from "@/components/markdown/MarkdownEditorLabelsContext";
import { NavigationFeedback } from "@/components/NavigationFeedback";
import { NotificationsMenu } from "@/components/NotificationsMenu";
import { SignInLink } from "@/components/SignInLink";
import { SiteAnnouncementToast } from "@/components/SiteAnnouncementToast";
import { SitePresenceHeartbeat } from "@/components/SitePresenceHeartbeat";
import { TimeZoneReporter } from "@/components/TimeZoneReporter";
import { UserAvatar } from "@/components/UserAvatar";
import { WebVitalsReporter } from "@/components/WebVitalsReporter";
import { resendEmailVerificationAction } from "@/lib/actions/account-actions";
import { logoutAction } from "@/lib/actions/auth-actions";
import { getCurrentUser } from "@/lib/auth";
import { dailyProblemDateKey } from "@/lib/daily-problem-schedule";
import { prisma } from "@/lib/db";
import { dictionaryForContentLanguage } from "@/lib/i18n/server";
import { CONTENT_LANGUAGE_COOKIE, parseActiveContentLanguage } from "@/lib/languages";
import { canUseAdminTools, canUseModerationTools } from "@/lib/permissions";
import { CONTEST_TIME_ZONE } from "@/lib/problem-contests";
import { displayNameForUser } from "@/lib/user-display";

export const metadata: Metadata = {
  metadataBase: new URL("https://mathwoods.org"),
  title: "Math Woods | Free Mathematics Problems and Concepts",
  description: "A free, open-source knowledge graph of mathematical problems, exercises, and concepts.",
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: "Math Woods | Free Mathematics Problems and Concepts",
    description: "A free, open-source knowledge graph of mathematical problems, exercises, and concepts.",
    url: "https://mathwoods.org",
    siteName: "Math Woods",
    type: "website",
    images: [{ url: "/math-woods-bear.png", alt: "Math Woods" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Math Woods | Free Mathematics Problems and Concepts",
    description: "A free, open-source knowledge graph of mathematical problems, exercises, and concepts.",
    images: ["/math-woods-bear.png"]
  },
  icons: {
    icon: [
      {
        url: "/favicon-light.png?v=21148016",
        type: "image/png",
        sizes: "512x512",
        media: "(prefers-color-scheme: light)"
      },
      {
        url: "/favicon-dark.png?v=bd06f8c2",
        type: "image/png",
        sizes: "512x512",
        media: "(prefers-color-scheme: dark)"
      }
    ],
    apple: "/favicon-dark.png?v=bd06f8c2"
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

const siteStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://mathwoods.org/#website",
      url: "https://mathwoods.org/",
      name: "Math Woods",
      alternateName: ["MathWoods", "mathwoods.org"],
      inLanguage: ["en", "fr"]
    },
    {
      "@type": "Organization",
      "@id": "https://mathwoods.org/#organization",
      url: "https://mathwoods.org/",
      name: "Math Woods",
      logo: {
        "@type": "ImageObject",
        url: "https://mathwoods.org/math-woods-bear.png"
      },
      sameAs: ["https://github.com/Kolinnor/math-woods"]
    }
  ]
};

const mathematiciansRoute = "/mathematicians" as Route;
const usersRoute = "/users" as Route;

const inter = localFont({
  src: "./fonts/inter-latin-variable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-sans"
});

const spectral = localFont({
  src: [
    { path: "./fonts/spectral-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/spectral-latin-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/spectral-latin-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/spectral-latin-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/spectral-latin-800.woff2", weight: "800", style: "normal" }
  ],
  display: "swap",
  variable: "--font-serif"
});

function validBackground(value: string | undefined) {
  return value === "plain" || value === "green" || value === "paper" || value === "contours" ? value : undefined;
}

function validBackgroundTone(value: string | undefined) {
  return value === "sage" || value === "amber" || value === "blue" || value === "rose" ? value : undefined;
}

async function getActiveContest(today: string) {
  if (!process.env.DATABASE_URL) return null;

  try {
    return await prisma.problemContest.findFirst({
      where: {
        publishedAt: { not: null },
        startDateKey: { lte: today },
        endDateKey: { gte: today }
      },
      select: { id: true }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") return null;
    throw error;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const today = dailyProblemDateKey(new Date(), CONTEST_TIME_ZONE);
  const [user, activeContest] = await Promise.all([
    getCurrentUser(),
    getActiveContest(today)
  ]);
  const cookieStore = await cookies();
  const initialBackground = validBackground(cookieStore.get("math-woods-background")?.value) ?? "green";
  const initialBackgroundTone = validBackgroundTone(cookieStore.get("math-woods-background-tone")?.value) ?? "sage";
  const initialLanguage = parseActiveContentLanguage(cookieStore.get(CONTENT_LANGUAGE_COOKIE)?.value);
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
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteStructuredData) }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: appearanceBootScript
          }}
        />
      </head>
      <body className={`${inter.variable} ${spectral.variable}`}>
        <Suspense fallback={null}>
          <NavigationFeedback />
        </Suspense>
        <ErrorReporter />
        <WebVitalsReporter />
        <SitePresenceHeartbeat />
        <TimeZoneReporter />
        <header className="site-header">
          <nav className="site-nav site-content-width mx-auto px-4">
            <Link href="/" className="site-brand" aria-label={t.nav.homeAriaLabel}>
              <img src="/math-woods-bear.png" alt="" className="site-brand-logo" aria-hidden="true" />
              <span>Math Woods</span>
            </Link>
            <div className="primary-nav">
              <Link href="/problems" data-tour-target="nav-problems">{t.nav.problems}</Link>
              <Link href="/concepts" data-tour-target="nav-concepts">{t.nav.concepts}</Link>
              {user && canUseAdminTools(user) && <Link href="/tips">{t.nav.tips}</Link>}
              <Link href={usersRoute}>{t.nav.users}</Link>
              {activeContest && <Link href="/contest">{t.nav.contest}</Link>}
              {user && canUseAdminTools(user) && <Link href={mathematiciansRoute}>{t.nav.mathematicians}</Link>}
            </div>
            <div className="nav-tools">
              {!user && (
                <SignInLink className="guest-home-sign-in">
                  {t.nav.signIn}
                </SignInLink>
              )}
              <LanguageSelector
                initialLanguage={initialLanguage}
                label={t.languageSelector.label}
                title={t.languageSelector.choose}
              />
              <AutoClosingDetails className="nav-menu">
                <summary aria-label={t.nav.moreAriaLabel} title={t.nav.moreTitle} data-tour-target="menu">
                  <Menu size={18} />
                </summary>
                <div className="nav-menu-popover">
                  <div className="nav-menu-primary-mobile">
                    <Link href="/problems" data-tour-target="nav-problems">{t.nav.problems}</Link>
                    <Link href="/concepts" data-tour-target="nav-concepts">{t.nav.concepts}</Link>
                    {user && canUseAdminTools(user) && <Link href="/tips">{t.nav.tips}</Link>}
                    <Link href={usersRoute}>{t.nav.users}</Link>
                    {activeContest && <Link href="/contest">{t.nav.contest}</Link>}
                    {user && canUseAdminTools(user) && <Link href={mathematiciansRoute}>{t.nav.mathematicians}</Link>}
                  </div>
                  <div className="nav-menu-divider nav-menu-primary-divider" />
                  <Link href="/recent-changes">{t.nav.recentChanges}</Link>
                  <Link href={"/contributing/tasks" as Route}>{t.nav.contributionTasks}</Link>
                  {user && canUseAdminTools(user) && <Link href="/contributing">{t.nav.contributing}</Link>}
                  <Link href="/about">{t.nav.about}</Link>
                  {user && <div className="nav-menu-divider" />}
                  {user && (
                    <Link href={`/profile/${user.profileSlug}`} className="nav-menu-user">
                      <UserAvatar user={user} size="sm" />
                      <span>{displayNameForUser(user)}</span>
                    </Link>
                  )}
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
                    <SignInLink className="nav-menu-action">
                      {t.nav.signIn}
                    </SignInLink>
                  )}
                  <div className="nav-menu-divider nav-menu-tour-divider" />
                  <Link href={"/about/tutorial" as Route} className="nav-menu-tour-link">{t.nav.tour}</Link>
                </div>
              </AutoClosingDetails>
            </div>
          </nav>
          {needsEmailVerification && user && (
            <EmailVerificationBanner
              userId={user.id}
              resendAction={resendEmailVerificationAction}
              labels={{
                message: t.verifyEmailPage.bannerMessage,
                resend: t.verifyEmailPage.resend
              }}
            />
          )}
        </header>
        {!user && <GuestProgressPrompt />}
        {user && (
          <div className="site-toast-stack">
            <SiteAnnouncementToast userId={user.id} />
            <AchievementToast userId={user.id} />
          </div>
        )}
        {user && (
          <div className="floating-friends-menu">
            <NotificationsMenu userId={user.id} />
            <FriendsMenu user={user} />
          </div>
        )}
        <main className="site-main site-content-width mx-auto px-4 py-8">
          <MarkdownEditorLabelsProvider labels={t.markdownEditor}>{children}</MarkdownEditorLabelsProvider>
        </main>
        <Suspense fallback={null}>
          <MathWoodsTourOverlay initialLocale={initialLanguage === "fr" ? "fr" : "en"} />
        </Suspense>
        <footer className="site-footer">
          <div className="site-content-width mx-auto grid gap-3 px-4 py-6 text-sm md:grid-cols-[1fr_auto] md:items-center">
            <p>{t.footer.legal}</p>
            <div className="flex flex-wrap justify-end gap-4">
              <Link href="/about">{t.footer.about}</Link>
              <Link href="/contributing">{t.footer.contribute}</Link>
              <Link href={"/legal" as Route}>{t.footer.legalAndBrand}</Link>
              <a
                href="https://github.com/Kolinnor/math-woods"
                className="inline-flex items-center gap-1.5"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github size={15} aria-hidden="true" />
                <span>GitHub</span>
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
