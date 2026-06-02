import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : undefined

const tunnelOrigin = process.env.NEXT_PUBLIC_TUNNEL_URL
  ? new URL(process.env.NEXT_PUBLIC_TUNNEL_URL).hostname
  : undefined

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: __dirname,
  turbopack: {},
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    ...(tunnelOrigin ? [tunnelOrigin] : []),
  ],
  images: {
    remotePatterns: [
      ...(supabaseHostname
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHostname,
              pathname: "/storage/v1/object/**",
            },
          ]
        : []),
    ],
  },
};

export default withSerwist(nextConfig);
