import type { NextConfig } from "next";

const backendOrigin =
  process.env.BACKEND_ORIGIN?.replace(/\/$/, "") || "http://127.0.0.1:5000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
