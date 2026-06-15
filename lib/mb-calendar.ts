// ②③ MB運営カレンダー（mb_calendar 単一行）の共通ヘルパー。
// テーブル未作成（勝彦のSQL未実行）でも安全にフォールバックする。
import type { Availability } from '@/lib/google-calendar'

export type MbCalendar = {
  google_email: string | null
  oauth_tokens: unknown | null
  active: boolean
  business_start: string
  business_end: string
  no_weekend: boolean
  no_holiday: boolean
  slot_minutes: number
  buffer_minutes: number
}

export const MB_DEFAULTS: MbCalendar = {
  google_email: null, oauth_tokens: null, active: false,
  business_start: '09:00', business_end: '18:00',
  no_weekend: true, no_holiday: true, slot_minutes: 30, buffer_minutes: 0,
}

/** mb_calendar(id=1) を取得。未作成/未設定なら null。呼び出し側で MB_DEFAULTS にフォールバック。 */
export async function getMbCalendar(admin: { from: (t: string) => any }): Promise<MbCalendar | null> {
  try {
    const { data, error } = await admin.from('mb_calendar').select('*').eq('id', 1).single()
    if (error || !data) return null
    return data as MbCalendar
  } catch {
    return null
  }
}

/** 設定 → Availability（slots算出用）。土日除外は days で表現。 */
export function toAvailability(c: MbCalendar): Availability {
  const days = c.no_weekend ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]
  return {
    days,
    start: c.business_start || '09:00',
    end: c.business_end || '18:00',
    slot_minutes: c.slot_minutes || 30,
    buffer_minutes: c.buffer_minutes ?? 0,
  }
}

// ── 日本の祝日（2026–2027、予約ホライズン分をカバー）──────────────────────────
const JP_HOLIDAYS = new Set<string>([
  // 2026
  '2026-01-01', '2026-01-12', '2026-02-11', '2026-02-23', '2026-03-20',
  '2026-04-29', '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06',
  '2026-07-20', '2026-08-11', '2026-09-21', '2026-09-22', '2026-09-23',
  '2026-10-12', '2026-11-03', '2026-11-23',
  // 2027
  '2027-01-01', '2027-01-11', '2027-02-11', '2027-02-23', '2027-03-21', '2027-03-22',
  '2027-04-29', '2027-05-03', '2027-05-04', '2027-05-05', '2027-07-19', '2027-08-11',
  '2027-09-20', '2027-09-23', '2027-10-11', '2027-11-03', '2027-11-23',
])

/** date = 'YYYY-MM-DD'（JST基準）が日本の祝日か */
export function isJapaneseHoliday(date: string): boolean {
  return JP_HOLIDAYS.has(date)
}
