import type { Metadata } from "next";
import Link from "next/link";
import { Menu, Search } from "lucide-react";
import "./globals.css";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/lib/actions/auth-actions";

export const metadata: Metadata = {
  title: "Math Woods",
  description: "A free, ad-free place for math problems, linked concepts, and delayed discussions.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  }
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var e=document.documentElement,t=localStorage.getItem('math-woods-theme')||localStorage.getItem('math-hills-theme')||localStorage.getItem('math-garden-theme'),b=localStorage.getItem('math-woods-background')||localStorage.getItem('math-hills-background'),c=localStorage.getItem('math-woods-background-tone')||localStorage.getItem('math-hills-background-tone');e.dataset.theme=(t==='light'||t==='dim'||t==='dark')?t:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');e.dataset.background=(b==='plain'||b==='green'||b==='paper'||b==='contours')?b:'green';e.dataset.backgroundTone=(c==='sage'||c==='amber'||c==='blue'||c==='rose')?c:'sage'}catch(e){}"
          }}
        />
      </head>
      <body>
        <header className="site-header">
          <nav className="site-nav mx-auto max-w-6xl px-4">
            <Link href="/" className="site-brand" aria-label="Math Woods home">
              <span>Math Woods</span>
            </Link>
            <div className="primary-nav">
              <Link href="/problems">Problems</Link>
              <Link href="/concepts">Concepts</Link>
              <Link href="/playlists">Playlists</Link>
              <Link href="/quotes">Quotes</Link>
              <Link href="/competition">Competition</Link>
            </div>
            <div className="nav-tools">
              <LiveSearchForm action="/search" className="header-search">
                <Search size={16} aria-hidden="true" />
                <input name="q" aria-label="Search Math Woods" placeholder="Search" />
              </LiveSearchForm>
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
                  {user && <Link href={`/profile/${user.username}`}>@{user.username}</Link>}
                  {user && <Link href="/settings">Settings</Link>}
                  {(user?.role === "MODERATOR" || user?.role === "ADMIN") && <Link href="/moderation">Moderation</Link>}
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
        </header>
        <main className="site-main mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="site-footer">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm">
            <p>Math Woods is free, open source, and ad-free.</p>
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
