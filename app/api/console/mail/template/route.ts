/**
 * PUT    /api/console/mail/template — テンプレ上書きの保存（category=key で upsert）
 * DELETE /api/console/mail/template?key=... — 上書きを削除（既定文面に戻す）
 * owner/manager のみ。message_templates は additive 利用（channel='email'）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { MAIL_REGISTRY_BY_KEY } from '@/lib/mail-registry'

export const runtime = 'edge'

async function gate() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user }
}

export async function PUT(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return g.error

  const body = await req.json().catch(() => ({}))
  const key = String(body.key ?? '')
  const def = MAIL_REGISTRY_BY_KEY[key]
  if (!def) return NextResponse.json({ error: '不明なテンプレートです' }, { status: 400 })
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 200) : null
  const tplBody = typeof body.body === 'string' ? body.body.trim().slice(0, 8000) : null
  const isActive = body.is_active !== false
  if (!subject && !tplBody) return NextResponse.json({ error: '件名または本文を入力してください' }, { status: 400 })

  const service = await createServiceRoleClient()
  const { data: existing } = await service
    .from('message_templates').select('id')
    .eq('category', key)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await service.from('message_templates')
      .update({ subject, body: tplBody, is_active: isActive, title: def.name, channel: 'email', updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: existing.id })
  }
  const { data, error } = await service.from('message_templates')
    .insert({ category: key, title: def.name, channel: 'email', subject, body: tplBody, is_active: isActive, created_by: g.user.id })
    .select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function DELETE(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return g.error
  const key = req.nextUrl.searchParams.get('key') ?? ''
  if (!MAIL_REGISTRY_BY_KEY[key]) return NextResponse.json({ error: '不明なテンプレートです' }, { status: 400 })
  const service = await createServiceRoleClient()
  const { error } = await service.from('message_templates').delete().eq('category', key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
