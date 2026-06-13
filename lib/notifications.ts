/**
 * Notification helper — すべての通知書き込みはこの関数経由にする
 *
 * 呼び出し側は必ず createServiceRoleClient() から得た supabase を渡すこと。
 * (パートナー本人の操作以外で notifications を書くには service_role が必要)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type NotificationRef =
  | { type: 'deal';          id: string }
  | { type: 'payout';        batch_id: string }
  | { type: 'payout_paid';   batch_id: string }
  | { type: 'broadcast';     broadcast_id: string }
  | { type: 'inquiry_reply'; inquiry_id: string }
  | { type: string; [key: string]: unknown }

/**
 * 1件の通知を作成する。
 */
export async function createNotification(
  supabase: SupabaseClient,
  partnerId: string,
  title: string,
  body?: string | null,
  ref?: NotificationRef | null,
): Promise<void> {
  await supabase.from('notifications').insert({
    partner_id: partnerId,
    title,
    body:  body  ?? null,
    ref:   ref   ?? null,
  })
}

/**
 * 複数パートナーへ一括通知する。
 * 例: 支払バッチ完了時に全対象パートナーへ通知
 */
export async function createNotifications(
  supabase: SupabaseClient,
  items: Array<{
    partnerId: string
    title:     string
    body?:     string | null
    ref?:      NotificationRef | null
  }>,
): Promise<void> {
  if (items.length === 0) return
  await supabase.from('notifications').insert(
    items.map(({ partnerId, title, body, ref }) => ({
      partner_id: partnerId,
      title,
      body: body ?? null,
      ref:  ref  ?? null,
    })),
  )
}
