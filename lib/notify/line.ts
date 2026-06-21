/**
 * LINE配線 L-A：LINE Messaging API チャネル（Channel interface 実装・additive）。
 * enabledFor = partner_line_links に紐付けがあれば true（今は紐付けゼロ→常に false＝安全に skip）。
 * deliver   = line_user_id を引き Messaging API push（Bearer=チャネルアクセストークン）。
 * Node ランタイム前提。お金・案件状態には非接触。紐付け/トークン不能時は graceful（他チャネルを壊さない）。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Channel, NotifyPayload } from './types'
import { getLineAccessToken } from './line-token'

async function lineUserIdFor(admin: SupabaseClient, partnerId: string): Promise<string | null> {
  const { data } = await admin.from('partner_line_links').select('line_user_id').eq('partner_id', partnerId).maybeSingle()
  return (data?.line_user_id as string | undefined) ?? null
}

export const lineChannel: Channel = {
  name: 'line',
  enabledFor: async (admin, partnerId) => {
    return (await lineUserIdFor(admin, partnerId)) != null
  },
  deliver: async (admin, partnerId, payload: NotifyPayload) => {
    const userId = await lineUserIdFor(admin, partnerId)
    if (!userId) return { sent: 0, failed: 0 } // 紐付け無し＝何もしない
    const token = await getLineAccessToken()
    if (!token) return { sent: 0, failed: 1 } // トークン不能＝graceful fail（他チャネルに影響なし）
    try {
      const text = [payload.title, payload.body].filter(Boolean).join('\n')
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: userId, messages: [{ type: 'text', text }] }),
      })
      return res.ok ? { sent: 1, failed: 0 } : { sent: 0, failed: 1 }
    } catch {
      return { sent: 0, failed: 1 }
    }
  },
}
