import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'edge'

// Returns the currently logged-in admin's profile (name / email / color / role / avatar).
// Read-only — used to unify account display across the console (sidebar, settings, admin list).
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({}, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, email, color, role, avatar_url')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({}, { status: 404 })
  return NextResponse.json(profile)
}

// 自分のプロフィール（表示名・色）を更新。★本人のみ＝auth.uid の行のみ（他人は書き換え不可）。
// money/権限(role)/auth には一切触れない。avatar 画像は /api/console/avatar 側。
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // コンソール利用者のみ（partner は対象外）。
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!me || me.role === 'partner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if (typeof b.name === 'string') {
    const n = b.name.trim().slice(0, 60)
    if (!n) return NextResponse.json({ error: '表示名を入力してください' }, { status: 400 })
    patch.name = n
  }
  if (typeof b.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(b.color.trim())) patch.color = b.color.trim()
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const admin = await createServiceRoleClient()
  // ★self のみ：auth.uid の profiles 行だけ更新。role/perms/money列には触れない。
  const { data, error } = await admin.from('profiles').update(patch).eq('id', user.id).select('id, name, color').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, profile: data })
}
