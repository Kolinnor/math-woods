import Image from "next/image";
import { Github } from "lucide-react";
import type { OAuthProviderKey } from "@/lib/oauth-utils";

const PROVIDER_ICONS: Record<Exclude<OAuthProviderKey, "github">, { src: string; size: number }> = {
  google: { src: "/brands/google-g.png", size: 18 },
  orcid: { src: "/brands/orcid-id.svg", size: 22 }
};

export function OAuthProviderIcon({ provider }: { provider: OAuthProviderKey }) {
  if (provider === "github") {
    return (
      <span className="oauth-provider-icon oauth-provider-icon-github" aria-hidden="true">
        <Github />
      </span>
    );
  }
  const icon = PROVIDER_ICONS[provider];

  return (
    <span className={`oauth-provider-icon oauth-provider-icon-${provider}`} aria-hidden="true">
      <Image src={icon.src} alt="" width={icon.size} height={icon.size} />
    </span>
  );
}
