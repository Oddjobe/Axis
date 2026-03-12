import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://images.unsplash.com https://*.supabase.co; font-src 'self' data:; connect-src 'self' https://* localhost:*; worker-src 'self' blob:;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
