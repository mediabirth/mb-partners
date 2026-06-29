/**
 * 段階C：ログイン中メンバー自身の通知宛先（member_notification_prefs）。
 * GET   — 自分の prefs を返す（未作成なら email_to=自分のメール・email_enabled=true の既定値）。
 * PATCH — 自分の email_to / email_enabled を upsert（自分の user_id に限定）。
 * owner/manager 用（partner は対象外）。money 非接触。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

async function requireMember(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', user.id).single()
  if (!profile || profile.role === 'partner') return null
  return { id: user.id, email: profile.email as string | null }
}

export async function GET() {
  const supabase = await createClient()
  const me = await requireMember(supabase)
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { data } = await admin.from('member_notification_prefs').select('email_to, email_enabled').eq('user_id', me.id).single()
  return NextResponse.json({
    email_to: data?.email_to ?? me.email ?? '',
    email_enabled: data?.email_enabled ?? true,
  })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const me = await requireMember(supabase)
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = { user_id: me.id }
  if (typeof b.email_to === 'string') patch.email_to = b.email_to.trim().slice(0, 200) || null
  if (typeof b.email_enabled === 'boolean') patch.email_enabled = b.email_enabled
  const admin = await createServiceRoleClient()
  const { error } = await admin.from('member_notification_prefs').upsert(patch, { onConflict: 'user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
