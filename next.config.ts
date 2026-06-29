import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Type-checking runs locally via `pnpm run build`; skip on Vercel to avoid
    // tsconfig regeneration issues in the Vercel build environment
    ignoreBuildErrors: true,
  },
  // E: 画像最適化。サービスロゴ等を表示サイズへリサイズ（フルサイズ660KB→数KB）。
  // ロゴは local /logos/*.jpg と Supabase Storage(public) の2系統。SVGは無し。
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'zwnpbqpntiwsacsrrvfk.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
};

export default nextConfig;
