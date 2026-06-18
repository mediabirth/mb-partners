// BR-DIAG2：版数スタンプ。デプロイ毎に更新し、本番 vendor がこのビルドを描画しているかの決定的証拠にする。
// VERCEL_GIT_COMMIT_SHA があればそれを優先（本番ビルド時に Vercel が注入）。無ければ下記リテラル。
export const BUILD_STAMP = (process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? '743cfb7') + ' · 2026-06-19 01:58 JST'
