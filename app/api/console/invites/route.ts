/**
 * POST /api/console/invites  — 招待レコードを作成し invite URL を返す
 * GET  /api/console/invites  — 招待一覧を返す
 *
 * invites テーブルの既存スキーマ:
 *   id, kind(NOT NULL), role, email, token(NOT NULL), expires_at, used_at, created_by, created_at, name
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { sendInviteEmail } from '@/lib/email'
import { partnerFacingOrigin, requestOrigin } from '@/lib/app-origin'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { email, role: rawRole = 'partner', name } = body
  // ④ Owners are never invited via this flow — clamp anything but 'partner'.
  const role = rawRole === 'owner' ? 'partner' : rawRole
  // A1: フロンティア意図はURLクエリではなくDBへ永続化（メールの素のリンクからでも確実にフロンティア登録になる）
  const isFrontier = body.frontier === true
  if (!email?.trim()) return NextResponse.json({ error: 'email は必須です' }, { status: 400 })

  const service = await createServiceRoleClient()
  const { data: invite, error } = await service
    .from('invites')
    .insert({
      email:      email.trim().toLowerCase(),
      kind:       'partner',
      role,
      name:       name?.trim() || null,
      is_frontier: isFrontier,
      created_by: user.id,
    })
    .select('token, email, name, expires_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // A5: 招待URLは常にパートナーAPP側ホストで組む（consoleホスト由来のままだと受諾ページの
  // サインイン cookie が mb-auth-console に書かれ、/app 遷移で必ずログインへ落ちる）
  const origin = partnerFacingOrigin(requestOrigin(req))
  const invite_url = `${origin}/invite/${invite.token}${isFrontier ? '?role=frontier' : ''}`

  // Send the branded invite email (no-op if RESEND_API_KEY is unset — the
  // invite_url is still returned so it can be shared manually).
  const mail = await sendInviteEmail({
    to: invite.email,
    name: invite.name,
    url: invite_url,
    expiresAt: invite.expires_at,
    kind: isFrontier ? 'frontier' : 'partner',
  })

  return NextResponse.json({ invite_url, token: invite.token, emailed: mail.sent }, { status: 201 })
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = await createServiceRoleClient()
  const { data: invites } = await service
    .from('invites')
    .select('id, email, role, name, token, expires_at, used_at, created_at')
    .eq('kind', 'partner')
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ invites: invites ?? [] })
}
