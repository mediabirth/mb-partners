/** Wave1-④a：通知ディスパッチャの共有型（循環import回避のため分離）。 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type NotifyPayload = { title: string; body?: string; url?: string; tag?: string }

export type Channel = {
  name: string
  enabledFor: (admin: SupabaseClient, partnerId: string) => Promise<boolean>
  deliver: (admin: SupabaseClient, partnerId: string, payload: NotifyPayload) => Promise<{ sent: number; failed: number }>
}

export type NotifyResult = { channel: string; sent: number; failed: number }
