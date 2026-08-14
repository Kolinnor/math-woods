/** @type {import('next').NextConfig} */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'"
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
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
    devtoolSegmentExplorer: false,
    serverActions: {
      bodySizeLimit: "6mb"
    }
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
