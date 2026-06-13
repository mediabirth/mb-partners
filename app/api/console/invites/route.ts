/**
 * POST /api/console/invites  — 招待レコードを作成し invite URL を返す
 * GET  /api/console/invites  — 招待一覧を返す
 *
 * invites テーブルの既存スキーマ:
 *   id, kind(NOT NULL), role, email, token(NOT NULL), expires_at, used_at, created_by, created_at, name
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

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
  const { email, role = 'partner', name } = body
  if (!email?.trim()) return NextResponse.json({ error: 'email は必須です' }, { status: 400 })

  const service = await createServiceRoleClient()
  const { data: invite, error } = await service
    .from('invites')
    .insert({
      email:      email.trim().toLowerCase(),
      kind:       'partner',
      role,
      name:       name?.trim() || null,
      created_by: user.id,
    })
    .select('token')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const origin = req.headers.get('x-forwarded-proto') && req.headers.get('host')
    ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('host')}`
    : new URL(req.url).origin
  const invite_url = `${origin}/invite/${invite.token}`

  return NextResponse.json({ invite_url, token: invite.token }, { status: 201 })
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
