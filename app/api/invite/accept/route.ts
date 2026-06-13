/**
 * POST /api/invite/accept
 * 招待トークンを検証してアカウントを作成し、即時ログイン用 magic link を返す
 * （公開エンドポイント — 認証不要、service_role 使用）
 *
 * invites テーブルの既存スキーマ:
 *   id, kind, role, email, token(NOT NULL UNIQUE), expires_at, used_at, created_by, created_at, name
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

const PARTNER_COLORS = ['#4733E6', '#C2479E', '#15917E', '#D98914', '#E64733', '#9333EA']

function generatePartnerCode(name: string): string {
  const upper = name.trim().toUpperCase().replace(/[^A-Z]/g, '')
  const prefix = upper.length >= 2 ? upper.slice(0, 2) : ('ZZ' + upper).slice(-2)
  return prefix + Math.floor(1000 + Math.random() * 9000)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, name } = body

  if (!token || !name?.trim()) {
    return NextResponse.json({ error: 'token と name は必須です' }, { status: 400 })
  }

  const service = await createServiceRoleClient()

  // ── 招待トークン検証 ─────────────────────────────────────────
  const { data: invite } = await service
    .from('invites')
    .select('id, email, role, expires_at, used_at')
    .eq('token', token)
    .single()

  if (!invite)         return NextResponse.json({ error: '招待リンクが見つかりません' }, { status: 404 })
  if (invite.used_at)  return NextResponse.json({ error: 'この招待リンクはすでに使用済みです' }, { status: 409 })
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: '招待リンクの有効期限が切れています' }, { status: 410 })
  }

  const { email, role } = invite

  // ── auth.users 作成 or 既存ユーザー取得 ─────────────────────
  let userId: string

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
  })

  if (created?.user) {
    userId = created.user.id
  } else {
    // ユーザーが既に存在する場合は listUsers で検索
    const { data: listData } = await service.auth.admin.listUsers({ perPage: 1000 })
    const existing = listData?.users?.find(u => u.email === email)
    if (!existing) {
      return NextResponse.json(
        { error: `ユーザー作成に失敗しました: ${createErr?.message}` },
        { status: 500 }
      )
    }
    userId = existing.id
  }

  // ── profiles 作成（未作成の場合のみ）────────────────────────
  const { data: existingProfile } = await service
    .from('profiles').select('id').eq('id', userId).maybeSingle()

  if (!existingProfile) {
    const color = PARTNER_COLORS[Math.floor(Math.random() * PARTNER_COLORS.length)]
    const { error: profErr } = await service.from('profiles').insert({
      id:    userId,
      name:  name.trim(),
      role,
      email,
      color,
    })
    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 })
  }

  // ── partners 作成（role=partner かつ未作成の場合）──────────
  if (role === 'partner') {
    const { data: existingPartner } = await service
      .from('partners').select('id').eq('profile_id', userId).maybeSingle()

    if (!existingPartner) {
      let code = generatePartnerCode(name.trim())
      const { data: conflict } = await service
        .from('partners').select('id').eq('code', code).maybeSingle()
      if (conflict) code = generatePartnerCode(name.trim())

      const { error: partnerErr } = await service.from('partners').insert({
        profile_id: userId,
        code,
        status:   'active',
        tax_type: 'individual',
      })
      if (partnerErr) return NextResponse.json({ error: partnerErr.message }, { status: 500 })
    }
  }

  // ── invite を使用済みにマーク ─────────────────────────────
  await service.from('invites').update({ used_at: new Date().toISOString() }).eq('token', token)

  // ── 即時ログイン用 magic link 生成 ───────────────────────────
  const origin = process.env.NEXT_PUBLIC_APP_URL
    ?? (req.headers.get('x-forwarded-proto') && req.headers.get('host')
        ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('host')}`
        : new URL(req.url).origin)

  const { data: linkData } = await service.auth.admin.generateLink({
    type:    'magiclink',
    email,
    options: { redirectTo: `${origin}/auth/magic` },
  })

  const action_link = linkData?.properties?.action_link
  if (!action_link) {
    return NextResponse.json({ error: 'ログインリンクの生成に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({ action_link }, { status: 200 })
}
