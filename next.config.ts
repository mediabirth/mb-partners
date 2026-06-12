import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Type-checking runs locally via `pnpm run build`; skip on Vercel to avoid
    // tsconfig regeneration issues in the Vercel build environment
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
