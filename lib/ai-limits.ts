// SYNAPSE AI コスト制御の共通定数＋全体サーキットブレーカ（read-only集計・報酬money非接触）。
// 1ユーザー/日の上限は各ルートが ai_usage で従来どおり enforce。ここでは「全体/日」の暴走保険を追加する。

import type { SupabaseClient } from '@supabase/supabase-js'

export const SCAN_DAILY_PER_USER = 20    // scan（URL読み取り）/ユーザー/日
export const DRAFT_DAILY_PER_USER = 30   // draft-intro（紹介文生成・軽量haiku）/ユーザー/日
export const AI_GLOBAL_DAILY = 600       // 全体/日のサーキットブレーカ（暴走時の総上限・控えめ既定）

// JST の当日キー（ai_usage.day と一致）。
export function jstDay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
}

// 当日の全パートナー合計 ai_usage が AI_GLOBAL_DAILY を超えていれば true（service_role 集計＝read-only）。
export async function aiGlobalDailyExceeded(admin: SupabaseClient, day: string, cap: number = AI_GLOBAL_DAILY): Promise<boolean> {
  try {
    const { data } = await admin.from('ai_usage').select('count').eq('day', day)
    const total = (data ?? []).reduce((s: number, r: { count: number | null }) => s + (r.count ?? 0), 0)
    return total >= cap
  } catch { return false }   // 集計失敗時は止めない（機能を殺さない）
}

export const AI_BUSY_MESSAGE = 'ただいまSYNAPSEの分析が混み合っています。時間をおいてお試しください。'
