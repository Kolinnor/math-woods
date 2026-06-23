/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  poweredByHeader: false,
  output: "standalone",
  experimental: {
    devtoolSegmentExplorer: false
  }
};

export default nextConfig;
