/**
 * MBメンバー（内部・ディレクター）一覧と招待。owner/manager のみ。
 * GET  /api/console/members           — 内部メンバー（role in owner/manager）一覧
 * POST /api/console/members  {email,name} — manager 招待を発行（kind='member'）→ /member/accept/[token] URL
 * パートナー/vendor 招待とは kind で分離。reward/payout 等には触れない。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

async function requireWrite(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager', 'admin'].includes(profile.role)) return null
  return user
}

export async function GET() {
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  // 内部メンバー＝非partner・非vendor（= 案件の MB担当 director と同一の母集合）。
  // ※ user_role enum に 'admin' は無いため .in([...,'admin']) は使わない（enumエラー回避）。
  const { data } = await admin.from('profiles').select('id, name, email, role, color, avatar_url').neq('role', 'partner').neq('role', 'vendor').order('name')
  return NextResponse.json({ members: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const user = await requireWrite(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json()
  const email = String(b.email ?? '').trim().toLowerCase()
  const name = b.name ? String(b.name).trim() : null
  if (!email) return NextResponse.json({ error: 'email は必須です' }, { status: 400 })

  const service = await createServiceRoleClient()
  const { data: invite, error } = await service
    .from('invites')
    .insert({ email, kind: 'member', role: 'manager', name, created_by: user.id })
    .select('token, expires_at')
    .single()
  if (error) return NextResponse.json({ error: error.message, needsMigration: true }, { status: 200 })

  const origin = req.headers.get('x-forwarded-proto') && req.headers.get('host')
    ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('host')}`
    : new URL(req.url).origin
  return NextResponse.json({ invite_url: `${origin}/member/accept/${invite.token}`, token: invite.token }, { status: 201 })
}
