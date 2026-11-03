import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_INTERNAL_ORIGIN ?? "http://127.0.0.1:3001"}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
