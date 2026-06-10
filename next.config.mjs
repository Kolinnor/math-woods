/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  output: "standalone",
  experimental: {
    devtoolSegmentExplorer: false
  }
};

export default nextConfig;
