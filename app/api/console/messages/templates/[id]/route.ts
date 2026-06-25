import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { parseButtons } from '../route'

// メッセージセンター Phase3-A：テンプレート編集/削除。owner gate・service_role・隔離表のみ。
// ★削除はソフト削除（is_active=false）＝履歴/誤操作に強い。money/deals/帰属 非接触。
export const runtime = 'nodejs'

async function ownerGate() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'owner') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await ownerGate(); if (g.error) return g.error
  try {
    const { id } = await ctx.params
    const b = await req.json().catch(() => ({}))
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof b.title === 'string') { const t = b.title.trim().slice(0, 120); if (!t) return NextResponse.json({ error: 'テンプレ名を入力してください' }, { status: 400 }); patch.title = t }
    if (typeof b.body === 'string') patch.body = b.body.slice(0, 5000)
    if ('subject' in b) patch.subject = typeof b.subject === 'string' && b.subject.trim() ? b.subject.trim().slice(0, 200) : null
    if ('category' in b) patch.category = typeof b.category === 'string' && b.category.trim() ? b.category.trim().slice(0, 40) : null
    if ('channel' in b) patch.channel = ['line', 'email', 'both'].includes(b.channel) ? b.channel : null
    if ('attachments' in b) { const a = Array.isArray(b.attachments) ? b.attachments.filter((x: { type?: string; path?: string }) => x?.type === 'image' && x?.path).slice(0, 5) : []; patch.attachments = a.length ? a : null }
    if ('buttons' in b) { const btns = parseButtons(b.buttons); patch.buttons = btns.length ? btns : null }
    if (Number.isFinite(b.sort_order)) patch.sort_order = Math.trunc(b.sort_order)
    const admin = await createServiceRoleClient()
    const { data, error } = await admin.from('message_templates').update(patch).eq('id', id)
      .select('id, created_at, updated_at, title, body, subject, category, channel, attachments, buttons, sort_order, is_active').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ template: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await ownerGate(); if (g.error) return g.error
  try {
    const { id } = await ctx.params
    const admin = await createServiceRoleClient()
    const { error } = await admin.from('message_templates').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
