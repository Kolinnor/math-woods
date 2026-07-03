import type { ReactNode } from "react";

type ForestPageLayoutProps = {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow?: string;
  heroAlt?: string;
  heroImage?: string;
  meta?: ReactNode;
  sidebar?: ReactNode;
  title: string;
  workspaceClassName?: string;
};

export function ForestPageLayout({
  actions,
  children,
  className,
  description,
  eyebrow,
  heroAlt = "Ivan Shishkin forest painting",
  heroImage = "/art/brook-in-the-forest.jpg",
  meta,
  sidebar,
  title,
  workspaceClassName
}: ForestPageLayoutProps) {
  const shellClassName = className ? `forest-page-shell ${className}` : "forest-page-shell";
  const workspaceClassNames = [
    "forest-page-workspace",
    sidebar ? "forest-page-workspace-with-sidebar" : null,
    workspaceClassName
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClassName}>
      <section className="forest-page-hero">
        <img src={heroImage} alt={heroAlt} />
        <div className="forest-page-hero-overlay" />
        <div className="forest-page-hero-content">
          <div>
            {eyebrow && <p className="forest-page-hero-kicker">{eyebrow}</p>}
            <h1>{title}</h1>
            {description && <p className="forest-page-hero-description">{description}</p>}
          </div>
          {(meta || actions) && (
            <div className="forest-page-hero-meta">
              {meta}
              {actions && <div className="forest-page-hero-actions">{actions}</div>}
            </div>
          )}
        </div>
      </section>

      <div className={workspaceClassNames}>
        <div className="forest-page-primary">{children}</div>
        {sidebar && <aside className="forest-page-sidebar">{sidebar}</aside>}
      </div>
    </div>
  );
}
