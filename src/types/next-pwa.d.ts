declare module 'next-pwa' {
  import { NextConfig } from 'next';
  export default function withPWA(pluginOptions: any): (nextConfig?: NextConfig) => NextConfig;
}
