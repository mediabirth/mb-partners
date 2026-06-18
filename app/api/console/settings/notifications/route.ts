import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'edge'

const DEFAULTS = {
  slack_enabled: true,
  notify_new_deal: true,
  notify_status_change: true,
  notify_payout: true,
  email_enabled: true,
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const svc = await createServiceRoleClient()
  const { data } = await svc.from('notification_settings').select('*').eq('id', 1).single()
  return NextResponse.json({ settings: data ?? DEFAULTS })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const patch: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() }
  for (const k of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
    if (typeof body[k] === 'boolean') patch[k] = body[k]
  }

  const svc = await createServiceRoleClient()
  const { data, error } = await svc.from('notification_settings').upsert(patch, { onConflict: 'id' }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // QR: 月間目標（運営取り分）。monthly_target 列が未追加(DDL前)でも通知設定保存を壊さないよう分離した best-effort。
  let settings = data as Record<string, unknown>
  if ('monthly_target' in body) {
    const raw = body.monthly_target
    const val = raw === null || raw === '' ? null : Math.max(0, Math.round(Number(raw)) || 0)
    const { data: upd, error: tErr } = await svc.from('notification_settings').update({ monthly_target: val }).eq('id', 1).select('*').single()
    if (!tErr && upd) settings = upd as Record<string, unknown>
  }
  return NextResponse.json({ settings })
}
