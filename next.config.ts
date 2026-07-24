import type { NextConfig } from "next";

const buildSha =
  process.env.NEXT_PUBLIC_BUILD_SHA?.trim() ||
  process.env.VERCEL_GIT_COMMIT_SHA?.trim().slice(0, 7) ||
  'local'

const formatBuildTimeJst = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute} JST`
}

const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME?.trim() || formatBuildTimeJst()

const nextConfig: NextConfig = {
  // 版数スタンプと復帰時SHA比較は、全ビルド経路で同じ確定値を参照する。
  // CLIは明示env、Vercelビルドはgit SHA、ローカルだけ明白な "local" へフォールバックする。
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildSha,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },
  // 体感: ルート遷移を View Transitions でクロスフェード＝画面切替の連続感（ネイティブ感）。
  // 金銭/状態データはSW非キャッシュ（network優先）のまま＝stale表示は起きない。
  experimental: {
    viewTransition: true,
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
