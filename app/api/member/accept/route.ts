/**
 * POST /api/member/accept — MBメンバー招待を承認し、auth ユーザー＋profiles(role='manager') を作成。
 * partners/deliveries には紐付けない（内部メンバー）。partner/vendor accept とは別ルート。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

const MEMBER_COLORS = ['#4733E6', '#0E0E14', '#15917E', '#D98914', '#C2479E', '#2A7DE1']

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const { token, email: clientEmail, password, name } = await req.json().catch(() => ({}))
  if (!token) return NextResponse.json({ error: 'token は必須です' }, { status: 400 })
  if (!name?.trim()) return NextResponse.json({ error: 'お名前を入力してください' }, { status: 400 })
  if (!password || password.length < 8) return NextResponse.json({ error: 'パスワードは8文字以上で設定してください' }, { status: 400 })

  const service = await createServiceRoleClient()
  const { data: invite, error: iErr } = await service
    .from('invites').select('id, email, role, kind, expires_at, used_at').eq('token', token).single()
  if (iErr || !invite) return NextResponse.json({ error: '招待リンクが見つかりません' }, { status: 404 })
  if (invite.kind !== 'member') return NextResponse.json({ error: 'この招待はMBメンバー向けではありません' }, { status: 400 })
  if (invite.used_at) return NextResponse.json({ error: 'この招待リンクはすでに使用済みです' }, { status: 409 })
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: '招待リンクの有効期限が切れています' }, { status: 410 })

  const email = invite.email
  if (clientEmail && clientEmail.toLowerCase().trim() !== email.toLowerCase().trim()) {
    return NextResponse.json({ error: 'メールアドレスが招待と一致しません' }, { status: 400 })
  }
  const role = invite.role || 'manager'

  let userId: string
  const { data: created, error: cErr } = await service.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role } })
  if (created?.user) userId = created.user.id
  else {
    const isExists = (cErr as { status?: number })?.status === 422 || cErr?.message?.toLowerCase().includes('already')
    if (!isExists) return NextResponse.json({ error: 'ユーザー作成に失敗しました', detail: cErr?.message }, { status: 500 })
    const { data: prof } = await service.from('profiles').select('id').ilike('email', email).maybeSingle()
    if (prof?.id) userId = prof.id
    else {
      const { data: list } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const ex = list?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
      if (!ex) return NextResponse.json({ error: 'ユーザーが見つかりませんでした' }, { status: 500 })
      userId = ex.id
    }
    const { error: uErr } = await service.auth.admin.updateUserById(userId, { password, email_confirm: true })
    if (uErr) return NextResponse.json({ error: 'パスワード更新に失敗しました', detail: uErr.message }, { status: 500 })
  }

  const { data: existing } = await service.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (!existing) {
    const color = MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)]
    const { error: pErr } = await service.from('profiles').insert({ id: userId, name: name.trim(), role, email, color })
    if (pErr) return NextResponse.json({ error: pErr.message, detail: 'profiles insert failed' }, { status: 500 })
  } else {
    await service.from('profiles').update({ name: name.trim(), role }).eq('id', userId)
  }

  await service.from('invites').update({ used_at: new Date().toISOString(), name: name.trim() }).eq('token', token)
  return NextResponse.json({ ok: true }, { status: 200 })
}
