/**
 * 段階2：自分のカレンダー連携の解除（member_calendar_links）。
 * DELETE — ログイン本人の行のみ削除。★auth.uid でのみ操作＝他人の連携は解除できない。
 * money/書き込み経路/mb_calendar には触れない。
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'partner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = await createServiceRoleClient()
  // ★self のみ：auth.uid の行だけ削除（body/その他からの他人指定は受け付けない）。
  const { error } = await admin.from('member_calendar_links').delete().eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
