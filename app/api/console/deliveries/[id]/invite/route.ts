/**
 * POST /api/console/deliveries/[id]/invite  — 業務委託先(vendor)を招待。
 * owner/manager のみ。invites に kind='vendor'/role='vendor'/delivery_id を記録し、
 * /vendor/accept/[token] の招待URLを返す（パートナー招待フローに倣う・既存 invites を流用）。
 * パートナー側フローには一切影響しない（kind='vendor' で分離）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'email は必須です' }, { status: 400 })

  const service = await createServiceRoleClient()
  const { data: delivery, error: dErr } = await service.from('deliveries').select('id, name').eq('id', id).single()
  if (dErr || !delivery) return NextResponse.json({ error: '業務委託先が見つかりません' }, { status: 404 })

  const { data: invite, error } = await service
    .from('invites')
    .insert({ email, kind: 'vendor', role: 'vendor', name: delivery.name, delivery_id: id, created_by: user.id })
    .select('token, email, expires_at')
    .single()
  if (error) {
    // enum未追加(Run #1未実行) や delivery_id列未追加(Run #2未実行) は needsMigration。
    return NextResponse.json({ error: error.message, needsMigration: true }, { status: 200 })
  }

  const origin = req.headers.get('x-forwarded-proto') && req.headers.get('host')
    ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('host')}`
    : new URL(req.url).origin
  const invite_url = `${origin}/vendor/accept/${invite.token}`
  return NextResponse.json({ invite_url, token: invite.token, expires_at: invite.expires_at }, { status: 201 })
}
