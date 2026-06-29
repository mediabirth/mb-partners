/**
 * GET  /api/console/calendar — MB運営カレンダー設定＋連携状態を返す（owner/manager）
 * POST /api/console/calendar — 営業時間等の設定を保存（owner/manager）
 * mb_calendar 未作成時は GET=既定値, POST=needsMigration を返す（halt しない）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { MB_DEFAULTS } from '@/lib/mb-calendar'

async function requireOwner(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'partner') return null
  return user
}

export async function GET() {
  const supabase = await createClient()
  if (!(await requireOwner(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('mb_calendar').select('*').eq('id', 1).single()

  // 段階A：追加アカウント一覧（mb_calendars）。表示専用・oauth_tokens は返さない。未作成でも壊さない。
  // 既定アカウント（mb_calendar id=1）も先頭に並べ、UI は「既定＋追加」をまとめて表示する。
  const accounts: { id: string; account_label: string; google_email: string | null; active: boolean; is_default: boolean }[] = []
  if (data && !error) {
    accounts.push({
      id: 'default', account_label: 'MB運営（既定）',
      google_email: (data as any).google_email ?? null,
      active: !!(data as any).active && !!(data as any).oauth_tokens, is_default: true,
    })
  }
  try {
    const { data: extra } = await admin.from('mb_calendars').select('id, account_label, google_email, active, created_at').order('created_at', { ascending: true })
    for (const a of (extra ?? [])) {
      accounts.push({ id: a.id, account_label: a.account_label, google_email: a.google_email ?? null, active: !!a.active, is_default: false })
    }
  } catch { /* mb_calendars 未作成でも既定のみで返す */ }

  if (error || !data) {
    return NextResponse.json({ settings: MB_DEFAULTS, connected: false, ready: false, accounts })
  }
  const { oauth_tokens, ...settings } = data as Record<string, unknown>
  return NextResponse.json({ settings, connected: !!(data as any).active && !!oauth_tokens, ready: true, accounts })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  if (!(await requireOwner(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await req.json()
  const patch = {
    business_start: typeof b.business_start === 'string' ? b.business_start : MB_DEFAULTS.business_start,
    business_end:   typeof b.business_end === 'string' ? b.business_end : MB_DEFAULTS.business_end,
    no_weekend:     !!b.no_weekend,
    no_holiday:     !!b.no_holiday,
    slot_minutes:   Number(b.slot_minutes) || MB_DEFAULTS.slot_minutes,
    buffer_minutes: Number(b.buffer_minutes) || 0,
    updated_at:     new Date().toISOString(),
  }
  const admin = await createServiceRoleClient()
  const { error } = await admin.from('mb_calendar').upsert({ id: 1, ...patch }, { onConflict: 'id' })
  if (error) {
    // テーブル未作成（DDL未実行）
    return NextResponse.json({ ok: false, needsMigration: true, error: error.message }, { status: 200 })
  }
  return NextResponse.json({ ok: true })
}
