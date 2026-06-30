/**
 * POST /api/app/frontier/invite
 * フロンティア(is_frontier)本人が配下パートナーの招待リンクを発行。
 * 返す URL は /invite/{token}?f={自分のpartner_id} で、受諾時に frontier_id=自分・frontier_linked_at=now で自動紐づけ。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { sendInviteEmail } from '@/lib/email'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: partner } = await supabase
    .from('partners').select('id, is_frontier').eq('profile_id', user.id).single()
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
  if (!partner.is_frontier) return NextResponse.json({ error: 'Forbidden — frontier only' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const email = (body.email as string | undefined)?.trim().toLowerCase()
  const name  = (body.name as string | undefined)?.trim()
  if (!email) return NextResponse.json({ error: 'email は必須です' }, { status: 400 })

  const service = await createServiceRoleClient()
  const { data: invite, error } = await service
    .from('invites')
    .insert({ email, kind: 'partner', role: 'partner', name: name || null, created_by: user.id })
    .select('token, expires_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const origin = req.headers.get('x-forwarded-proto') && req.headers.get('host')
    ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('host')}`
    : new URL(req.url).origin
  // 配下紐づけ: ?f=フロンティアのpartner_id
  const invite_url = `${origin}/invite/${invite.token}?f=${partner.id}`

  // 招待メール（best-effort：失敗しても招待発行・成功は不変）。
  let emailed = false
  try {
    const r = await sendInviteEmail({ to: email, name: name || null, url: invite_url, expiresAt: invite.expires_at, kind: 'frontier' })
    emailed = r.sent
  } catch { /* best-effort */ }

  return NextResponse.json({ invite_url, token: invite.token, emailed }, { status: 201 })
}
