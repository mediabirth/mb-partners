/**
 * LINE配線 L-B：LINEログイン OAuth ヘルパ（通知用に LINE userId を取得するだけ・ログイン手段にはしない）。
 * state は HMAC 署名（partner本人＋CSRF nonce＋有効期限）。LINE_LOGIN_CHANNEL_ID/SECRET を使用。
 * Node ランタイム前提（node:crypto）。秘密値はログに出さない。お金・既存認証には非接触。
 */
import crypto from 'node:crypto'

export const LINE_REDIRECT_URI = 'https://mb-partners.app/api/line/callback'

function secret(): string {
  return process.env.LINE_LOGIN_CHANNEL_SECRET || ''
}

/** state = base64url("<partnerId>.<nonce>.<exp>.<hmac>")。partner本人＋CSRF＋失効を内包。 */
export function signState(partnerId: string, nonce: string, exp: number): string {
  const payload = `${partnerId}.${nonce}.${exp}`
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url')
  return Buffer.from(`${payload}.${sig}`).toString('base64url')
}

export function verifyState(state: string): { partnerId: string; nonce: string; exp: number } | null {
  try {
    const raw = Buffer.from(state, 'base64url').toString('utf8')
    const parts = raw.split('.')
    if (parts.length !== 4) return null
    const [partnerId, nonce, expStr, sig] = parts
    const expected = crypto.createHmac('sha256', secret()).update(`${partnerId}.${nonce}.${expStr}`).digest('base64url')
    const a = Buffer.from(sig), b = Buffer.from(expected)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
    const exp = Number(expStr)
    if (!exp || Date.now() > exp) return null
    return { partnerId, nonce, exp }
  } catch {
    return null
  }
}

export function authorizeUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINE_LOGIN_CHANNEL_ID || '',
    redirect_uri: LINE_REDIRECT_URI,
    state,
    scope: 'profile openid',
    bot_prompt: 'aggressive',
  })
  return `https://access.line.me/oauth2/v2.1/authorize?${p.toString()}`
}
