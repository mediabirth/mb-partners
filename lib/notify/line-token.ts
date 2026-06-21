/**
 * LINE配線 L-A：Messaging API のチャネルアクセストークン発行（client_credentials）。
 * LINE_CHANNEL_ID / LINE_CHANNEL_SECRET から短期トークンを発行し、有効期限前までキャッシュ＝失効前に再発行。
 * Node ランタイム前提（lib/notify/line.ts 経由・呼び出すAPIルートは runtime='nodejs'）。
 * 秘密値（ID/SECRET/トークン）はログに出さない。お金・案件状態には非接触。
 */

type Cached = { token: string; expiresAt: number }
let cache: Cached | null = null

/** 有効なアクセストークンを返す（キャッシュ優先・失効60秒前に再発行）。発行不能時は null（graceful）。 */
export async function getLineAccessToken(): Promise<string | null> {
  const id = process.env.LINE_CHANNEL_ID
  const secret = process.env.LINE_CHANNEL_SECRET
  if (!id || !secret) return null

  const now = Date.now()
  if (cache && cache.expiresAt - 60_000 > now) return cache.token

  try {
    const res = await fetch('https://api.line.me/v2/oauth/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: id,
        client_secret: secret,
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!data.access_token) return null
    cache = {
      token: data.access_token,
      // expires_in は秒。控えめに保持（無ければ 24h 既定）。
      expiresAt: now + (Number(data.expires_in) > 0 ? Number(data.expires_in) * 1000 : 24 * 3600_000),
    }
    return cache.token
  } catch {
    return null
  }
}
