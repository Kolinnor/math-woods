import type { MetadataRoute } from "next";

const SITE_URL = "https://mathwoods.org";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/challenge/",
        "/chat/",
        "/friends",
        "/import",
        "/login",
        "/me",
        "/moderation",
        "/notifications",
        "/settings",
        "/tips",
        "/verify-email"
      ]
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL
  };
}
