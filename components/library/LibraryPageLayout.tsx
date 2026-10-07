import type { ComponentProps } from "react";
import { ForestPageLayout } from "@/components/ForestPageLayout";

type LibraryPageLayoutProps = Omit<ComponentProps<typeof ForestPageLayout>, "heroImage" | "heroAlt"> & {
  locale: "fr" | "en";
};

export function LibraryPageLayout({ locale, ...props }: LibraryPageLayoutProps) {
  return (
    <ForestPageLayout
      {...props}
      description={undefined}
      heroImage="/art/history-forest-ruins.avif"
      heroAlt={locale === "fr" ? "Ruines de pierre au milieu de collines boisées" : "Stone ruins among forested hills"}
    />
  );
}
