/**
 * Wave1-④a：Web Push チャネル（チャネル非依存ディスパッチャの最初のプラグイン）。
 * web-push + VAPID で送信。Node ランタイム必須（呼び出すAPIルートは runtime='nodejs'）。
 * お金・案件状態には一切触れない。purely 通知配信。
 */
import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Channel, NotifyPayload } from './types'

let vapidReady = false
function ensureVapid(): boolean {
  if (vapidReady) return true
  const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env
  if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    vapidReady = true
    return true
  } catch {
    return false
  }
}

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string }

/** 1購読へ送信。成功=true。410/404（失効）は 'gone' を返し呼び出し側で無効化。 */
export async function sendWebPush(sub: SubRow, payload: NotifyPayload): Promise<'ok' | 'gone' | 'fail'> {
  if (!ensureVapid()) return 'fail'
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    )
    return 'ok'
  } catch (e) {
    const code = (e as { statusCode?: number })?.statusCode
    return code === 404 || code === 410 ? 'gone' : 'fail'
  }
}

export const webpushChannel: Channel = {
  name: 'webpush',
  enabledFor: async (admin: SupabaseClient, partnerId: string) => {
    if (!ensureVapid()) return false
    const { data } = await admin.from('push_subscriptions').select('id').eq('partner_id', partnerId).eq('enabled', true).limit(1)
    return (data?.length ?? 0) > 0
  },
  deliver: async (admin: SupabaseClient, partnerId: string, payload: NotifyPayload) => {
    const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('partner_id', partnerId).eq('enabled', true)
    let sent = 0, failed = 0
    for (const s of (subs ?? []) as SubRow[]) {
      const r = await sendWebPush(s, payload)
      if (r === 'ok') sent++
      else {
        failed++
        if (r === 'gone') await admin.from('push_subscriptions').update({ enabled: false }).eq('id', s.id) // 失効購読を無効化
      }
    }
    return { sent, failed }
  },
}
