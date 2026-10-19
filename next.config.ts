import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : undefined

// Dev origin allowlist: requests (incl. the /_next/hmr WebSocket) whose
// Origin/Referer host is not listed here get a bare 403 "Unauthorized" written
// raw onto the socket — which cloudflared reports as
// `net/http: HTTP/1.x transport connection broken: malformed HTTP response`.
// The Next dev client then hits WEB_SOCKET_MAX_RECONNECTIONS (12) and loads
// pages in an endless reload loop, so any host used through a tunnel must be
// listed. Entries are hostnames only (no scheme/port); single-label and
// recursive subdomain wildcard entries are supported per the next/config
// docs (allowedDevOrigins.md).
const tunnelOrigin = process.env.NEXT_PUBLIC_TUNNEL_URL
  ? new URL(process.env.NEXT_PUBLIC_TUNNEL_URL).hostname
  : undefined
const appOrigin = process.env.NEXT_PUBLIC_APP_URL
  ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname
  : undefined

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: __dirname,
  turbopack: {},
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    ...[tunnelOrigin, appOrigin].filter((h): h is string => !!h),
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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0",
          },
        ],
      },
    ]
  },
};

export default withSerwist(nextConfig);
