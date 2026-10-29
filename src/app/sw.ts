import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, CacheableResponsePlugin, ExpirationPlugin, Serwist } from "serwist";
import {
  THEME_ASSET_CACHE_NAME,
  THEME_ASSET_MAX_AGE_SECONDS,
  THEME_ASSET_MAX_ENTRIES,
  themeAssetMatcherSource,
} from "../lib/theme/serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// The SW is compiled as a separate webpack child compilation, so the platform
// storage origin is NOT inlined by Next's NEXT_PUBLIC_ DefinePlugin —
// next.config.ts injects it here via webpackCompilationPlugins instead
// (always a string literal; "" disables the theme-asset rule entirely).
const storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;

// P2 Task 7 (spec §5.3 cache-safety): cache-first 7-day runtime caching for
// event-themes bucket objects ONLY — the matcher (src/lib/theme/serwist.ts,
// unit-tested) anchors the escaped platform storage origin + the public
// event-themes prefix, so other buckets (certificates) and other hosts never
// match. The `-v{ts}` versioned filenames make every re-upload a new URL, so
// cache-first can never serve a stale overwrite.
const themeAssetRuntimeCache = (() => {
  const matcherSource = themeAssetMatcherSource(storageOrigin);
  if (!matcherSource) return [];
  return [
    {
      matcher: new RegExp(matcherSource),
      handler: new CacheFirst({
        cacheName: THEME_ASSET_CACHE_NAME,
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({
            maxEntries: THEME_ASSET_MAX_ENTRIES,
            maxAgeSeconds: THEME_ASSET_MAX_AGE_SECONDS,
          }),
        ],
      }),
    },
  ];
})();

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...themeAssetRuntimeCache, ...defaultCache],
});

serwist.addEventListeners();
