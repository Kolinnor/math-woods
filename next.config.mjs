/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
  }
];

const imageRemotePatterns = [];
const imagePublicBaseUrl = process.env.IMAGE_STORAGE_PUBLIC_BASE_URL?.trim();

if (imagePublicBaseUrl) {
  try {
    const imageUrl = new URL(imagePublicBaseUrl);
    const basePath = imageUrl.pathname.replace(/\/$/, "");
    imageRemotePatterns.push({
      protocol: imageUrl.protocol.replace(":", ""),
      hostname: imageUrl.hostname,
      port: imageUrl.port,
      pathname: `${basePath || ""}/**`
    });
  } catch {
    console.warn("Ignoring invalid IMAGE_STORAGE_PUBLIC_BASE_URL in next.config.mjs.");
  }
}

const nextConfig = {
  typedRoutes: true,
  poweredByHeader: false,
  output: "standalone",
  images: imageRemotePatterns.length
    ? {
        remotePatterns: imageRemotePatterns
      }
    : undefined,
  experimental: {
    devtoolSegmentExplorer: false
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
