// BR-DIAG2：版数スタンプ。実デプロイの git 短縮SHA＋時刻で毎回更新し、本番 vendor がこのビルドを
// 描画しているかの決定的証拠にする。優先順位（いずれも欠けてもローカル開発で壊れないようフォールバック維持）：
//   SHA  = NEXT_PUBLIC_BUILD_SHA（本番デプロイ時に --build-env で実HEADを注入。NEXT_PUBLIC_ はビルドで inline）
//        → VERCEL_GIT_COMMIT_SHA 先頭7文字（git連携デプロイ時に Vercel が注入）
//        → 既存リテラル '743cfb7'（フォールバック）
//   時刻 = NEXT_PUBLIC_BUILD_TIME → 既存リテラル
const SHA =
  process.env.NEXT_PUBLIC_BUILD_SHA ||
  (process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null) ||
  '743cfb7'
const TIME = process.env.NEXT_PUBLIC_BUILD_TIME || '2026-06-19 01:58 JST'

export const BUILD_STAMP = `${SHA} · ${TIME}`
