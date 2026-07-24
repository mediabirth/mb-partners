// next.config.ts がビルド時に実SHAとJST時刻を焼き込む。
// 設定外で直接評価された場合も、本物の版数に見える固定値は決して表示しない。
const SHA = process.env.NEXT_PUBLIC_BUILD_SHA || 'local'
const TIME = process.env.NEXT_PUBLIC_BUILD_TIME || 'unknown-time'

export const BUILD_STAMP = `${SHA} ・ ${TIME}`
