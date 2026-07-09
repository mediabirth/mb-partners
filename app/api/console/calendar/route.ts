/**
 * GET  /api/console/calendar — MB運営カレンダー設定＋連携状態を返す（owner/manager）
 * POST /api/console/calendar — 営業時間等の設定を保存（owner/manager）
 * mb_calendar 未作成時は GET=既定値, POST=needsMigration を返す（halt しない）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { MB_DEFAULTS } from '@/lib/mb-calendar'
import { decryptTokens, encryptTokens, type StoredTokens } from '@/lib/google-token'
import { getValidAccessToken } from '@/lib/google-calendar'

// 連携の“実際の生死”を判定：トークンを実際に更新試行し、成功=有効/例外=要再連携。
// 期限切れなら refresh を実行（＝失効したリフレッシュトークンをここで検出）。成功時は更新後トークンを保存。
async function checkLinkHealthy(admin: Awaited<ReturnType<typeof createServiceRoleClient>>, userId: string, oauthTokens: unknown): Promise<boolean> {
  try {
    const tokens = decryptTokens(oauthTokens as StoredTokens)
    await getValidAccessToken(tokens, async (refreshed) => {
      const updated = encryptTokens({ access_token: refreshed.access_token, refresh_token: tokens.refresh_token, expires_at: refreshed.expires_at })
      await admin.from('member_calendar_links').update({ oauth_tokens: updated, updated_at: new Date().toISOString() }).eq('user_id', userId)
    })
    return true
  } catch { return false }
}

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
  const members: { user_id: string; name: string | null; role: string; color: string | null; avatar_url: string | null; connected: boolean; healthy: boolean; google_email: string | null; is_self: boolean }[] = []
  try {
    const { data: profs } = await admin.from('profiles').select('id, name, role, color, avatar_url').in('role', ['owner', 'manager']).order('role').order('name')
    const { data: links } = await admin.from('member_calendar_links').select('user_id, google_email, active, oauth_tokens')
    const linkBy = new Map((links ?? []).map(l => [l.user_id as string, l]))
    for (const p of (profs ?? [])) {
      const lk = linkBy.get(p.id) as { google_email: string | null; active: boolean; oauth_tokens: unknown } | undefined
      const connected = !!(lk && lk.active && lk.google_email)
      // 実態表示（張りぼて根絶）：連携行があっても実トークンが失効なら healthy=false＝「要再連携」。
      const healthy = connected && !!lk?.oauth_tokens ? await checkLinkHealthy(admin, p.id, lk.oauth_tokens) : false
      members.push({
        user_id: p.id, name: p.name, role: p.role, color: p.color, avatar_url: (p as any).avatar_url ?? null,
        connected, healthy, google_email: lk?.google_email ?? null, is_self: p.id === me.id,
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
