import type { NextConfig } from "next";
// @ts-expect-error - next-pwa does not have type definitions
import withPWA from "next-pwa";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {},
};

export default withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
})(nextConfig);