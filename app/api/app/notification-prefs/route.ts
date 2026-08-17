import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

async function requirePartner() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).maybeSingle()
  if (!partner) return null
  const { data: profile } = await supabase.from('profiles').select('email').eq('id', user.id).maybeSingle()
  return { userId: user.id, email: profile?.email as string | null }
}

export async function GET() {
  const me = await requirePartner()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = await createServiceRoleClient()
  const { data } = await admin.from('member_notification_prefs').select('email_enabled').eq('user_id', me.userId).maybeSingle()
  return NextResponse.json({ email_enabled: data?.email_enabled ?? true })
}

export async function PATCH(req: NextRequest) {
  const me = await requirePartner()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { email_enabled?: unknown }
  if (typeof body.email_enabled !== 'boolean') return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const admin = await createServiceRoleClient()
  const { data: existing } = await admin.from('member_notification_prefs').select('email_to').eq('user_id', me.userId).maybeSingle()
  const { error } = await admin.from('member_notification_prefs').upsert({
    user_id: me.userId,
    email_to: existing?.email_to?.trim() || me.email?.trim() || null,
    email_enabled: body.email_enabled,
  }, { onConflict: 'user_id' })
  if (error) return NextResponse.json({ error: '保存できませんでした' }, { status: 500 })
  return NextResponse.json({ ok: true, email_enabled: body.email_enabled })
}
