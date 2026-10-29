import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// The Serwist SW (src/app/sw.ts) compiles as a webpack child compilation that
// does NOT inherit Next's NEXT_PUBLIC_ DefinePlugin values — so we inject the
// platform storage origin into that compilation explicitly via
// `webpackCompilationPlugins`. The plugin object below captures the real
// webpack module from the build's webpack hook (a resolvable direct webpack
// import doesn't exist under pnpm); the define is ALWAYS a string literal,
// and "" (unset env) makes the SW ship WITHOUT the theme-asset rule.
interface StorageOriginDefinePlugin {
  name: string;
  apply(compiler: unknown): void;
}

let webpackDefineApi: WebpackDefinePluginCtor | undefined;

// Minimal structural typing for the webpack hook so the DefinePlugin hand-off
// is strict-safe (this file sits outside the tsconfig include — flagged in the
// P2/P3 reviews). No behavior change: the captured constructor is exactly
// what Next passes in as `options.webpack.DefinePlugin`.
type WebpackDefinePluginCtor = new (definitions: Record<string, string>) => {
  apply: (compiler: unknown) => void;
};
type WebpackHookOptions = { webpack?: { DefinePlugin?: WebpackDefinePluginCtor } };

const themeStorageOriginDefinePlugin: StorageOriginDefinePlugin = {
  name: "ThemeStorageOriginDefinePlugin",
  apply(compiler) {
    if (webpackDefineApi) {
      new webpackDefineApi({ "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") }).apply(compiler);
    }
  },
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  webpackCompilationPlugins: [themeStorageOriginDefinePlugin],
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
  webpack(config, options: WebpackHookOptions) {
    webpackDefineApi = options.webpack?.DefinePlugin;
    return config;
  },
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
