/**
 * Wave1-④a：チャネル非依存 通知ディスパッチャ（additive・既存 lib/notifications.ts とは別物）。
 * notify(admin, partnerId, payload, {event}) を partner の「有効チャネル」へ配信する。
 *
 * チャネルは plugin 式：今回は webpush のみ登録。LINE/Email は同じ Channel interface を実装して
 * `channels` 配列に push するだけで差し込める（★ここが LINE 主役化の差し込み口）。
 * 既存モジュール（lib/notifications.ts / 各APIルート）は無改修。お金・案件状態には非接触。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Channel, NotifyPayload, NotifyResult } from './types'
import { inboxChannel } from './inbox'
import { webpushChannel } from './webpush'

export type { Channel, NotifyPayload, NotifyResult } from './types'

// 登録済みチャネル。inbox(永続) + webpush。LINE/Email を後付けする場合はここに追加（例: lineChannel）。
const channels: Channel[] = [inboxChannel, webpushChannel]

/** partner の有効な全チャネルへ payload を配信。お金・案件状態には触れない。 */
export async function notify(
  admin: SupabaseClient,
  partnerId: string,
  payload: NotifyPayload,
  _opts?: { event?: string },
): Promise<NotifyResult[]> {
  const out: NotifyResult[] = []
  for (const ch of channels) {
    try {
      if (await ch.enabledFor(admin, partnerId)) {
        const { sent, failed } = await ch.deliver(admin, partnerId, payload)
        out.push({ channel: ch.name, sent, failed })
      }
    } catch {
      out.push({ channel: ch.name, sent: 0, failed: 1 })
    }
  }
  return out
}
