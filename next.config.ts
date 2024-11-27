import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [];
  },
  webpack: (config) => {
    return config;
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb'
    },
  },
  /* config options here */
};

export default nextConfig;