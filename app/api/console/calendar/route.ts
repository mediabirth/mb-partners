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
  const me = await requireOwner(supabase)
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('mb_calendar').select('*').eq('id', 1).single()

  // 段階2：MBメンバー（owner/manager）×各自のカレンダー連携状況。oauth_tokens は返さない（連携有無のみ）。
  // is_self＝ログイン本人の行（連携/解除ボタンを出す対象）。
  const members: { user_id: string; name: string | null; role: string; color: string | null; avatar_url: string | null; connected: boolean; google_email: string | null; is_self: boolean }[] = []
  try {
    const { data: profs } = await admin.from('profiles').select('id, name, role, color, avatar_url').in('role', ['owner', 'manager']).order('role').order('name')
    const { data: links } = await admin.from('member_calendar_links').select('user_id, google_email, active')
    const linkBy = new Map((links ?? []).map(l => [l.user_id as string, l]))
    for (const p of (profs ?? [])) {
      const lk = linkBy.get(p.id) as { google_email: string | null; active: boolean } | undefined
      members.push({
        user_id: p.id, name: p.name, role: p.role, color: p.color, avatar_url: (p as any).avatar_url ?? null,
        connected: !!(lk && lk.active && lk.google_email), google_email: lk?.google_email ?? null, is_self: p.id === me.id,
      })
    }
  } catch { /* member_calendar_links 未作成でもメンバー一覧は返す */ }

  if (error || !data) {
    return NextResponse.json({ settings: MB_DEFAULTS, connected: false, ready: false, members })
  }
  const { oauth_tokens, ...settings } = data as Record<string, unknown>
  return NextResponse.json({ settings, connected: !!(data as any).active && !!oauth_tokens, ready: true, members })
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
