/**
 * LINE Login 認証（1タップログイン）ヘルパ — 新規・独立。
 * ★既存 lib/line-login.ts（連携専用・partnerId内包state）とは別物。改変しない。
 * state = base64url("<nonce>.<exp>.<hmac>")。partnerId は内包しない（ログイン開始時は partner 未確定）。
 * partner 特定は callback で「LINE token→userId→partner_line_links 1:1」により行う。
 * Node ランタイム前提（node:crypto）。秘密値はログに出さない。お金・既存認証には非接触。
 */
import crypto from 'node:crypto'

export const LINE_LOGIN_REDIRECT_URI = 'https://mb-partners.app/api/auth/line/callback'

function secret(): string {
  return process.env.LINE_LOGIN_CHANNEL_SECRET || ''
}

/** state 署名（nonce＋exp）。CSRF/改ざん防止。partnerId は含めない。 */
export function signLoginState(nonce: string, exp: number): string {
  const payload = `${nonce}.${exp}`
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url')
  return Buffer.from(`${payload}.${sig}`).toString('base64url')
}

export function verifyLoginState(state: string): { nonce: string; exp: number } | null {
  try {
    const raw = Buffer.from(state, 'base64url').toString('utf8')
    const parts = raw.split('.')
    if (parts.length !== 3) return null
    const [nonce, expStr, sig] = parts
    const expected = crypto.createHmac('sha256', secret()).update(`${nonce}.${expStr}`).digest('base64url')
    const a = Buffer.from(sig), b = Buffer.from(expected)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
    const exp = Number(expStr)
    if (!exp || Date.now() > exp) return null
    return { nonce, exp }
  } catch {
    return null
  }
}

/** 認可URL（redirect_uri=/api/auth/line/callback・scope=openid profile）。 */
export function loginAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINE_LOGIN_CHANNEL_ID || '',
    redirect_uri: LINE_LOGIN_REDIRECT_URI,
    state,
    scope: 'profile openid',
  })
  return `https://access.line.me/oauth2/v2.1/authorize?${p.toString()}`
}

/** 復帰先 redirect の許可判定：/app 配下の相対パスのみ（8235d04 の safeRedirect 同等）。 */
export function safeAppRedirect(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (raw.includes('\\')) return null
  for (let i = 0; i < raw.length; i++) { const c = raw.charCodeAt(i); if (c < 32 || c === 127) return null }
  if (/^https?:/i.test(raw) || raw.startsWith('//')) return null
  if (raw === '/app' || raw.startsWith('/app/')) return raw
  return null
}
