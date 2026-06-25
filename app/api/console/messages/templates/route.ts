import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

// メッセージセンター Phase3-A：テンプレートCRUD（一覧/作成）。owner gate・service_role操作・隔離表 message_templates のみ。
// ★money/deals/帰属/既存notify 非接触。例外安全。
export const runtime = 'nodejs'

// buttons: [{label,url}] http/https・最大3・空行除外。
export function parseButtons(raw: unknown): { label: string; url: string }[] {
  if (!Array.isArray(raw)) return []
  return raw.map((b: { label?: string; url?: string }) => ({ label: (b?.label ?? '').trim().slice(0, 40), url: (b?.url ?? '').trim().slice(0, 1000) }))
    .filter(b => b.label && /^https?:\/\//i.test(b.url)).slice(0, 3)
}

// blocks: 順序付き [{type:text/image/button,...}]・最大20・空除外。
export function parseTplBlocks(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return []
  const out: Record<string, unknown>[] = []
  for (const b of raw as Array<Record<string, unknown>>) {
    if (b?.type === 'text' && typeof b.text === 'string' && b.text.trim()) out.push({ type: 'text', text: b.text.slice(0, 5000) })
    else if (b?.type === 'image' && typeof b.path === 'string') out.push({ type: 'image', path: b.path, ...(typeof b.url === 'string' && /^https?:\/\//i.test(b.url) ? { url: b.url.slice(0, 1000) } : {}) })
    else if (b?.type === 'button' && typeof b.label === 'string' && typeof b.url === 'string' && /^https?:\/\//i.test(b.url) && b.label.trim()) out.push({ type: 'button', label: b.label.trim().slice(0, 40), url: b.url.slice(0, 1000) })
  }
  return out.slice(0, 20)
}

async function ownerGate() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'owner') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}

export async function GET() {
  const g = await ownerGate(); if (g.error) return g.error
  try {
    const admin = await createServiceRoleClient()
    const { data } = await admin.from('message_templates')
      .select('id, created_at, updated_at, title, body, subject, category, channel, attachments, buttons, blocks, sort_order, is_active')
      .eq('is_active', true).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
    return NextResponse.json({ templates: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const g = await ownerGate(); if (g.error) return g.error
  try {
    const b = await req.json().catch(() => ({}))
    const title = typeof b.title === 'string' ? b.title.trim().slice(0, 120) : ''
    if (!title) return NextResponse.json({ error: 'テンプレ名を入力してください' }, { status: 400 })
    const body = typeof b.body === 'string' ? b.body.slice(0, 5000) : null
    const subject = typeof b.subject === 'string' && b.subject.trim() ? b.subject.trim().slice(0, 200) : null
    const category = typeof b.category === 'string' && b.category.trim() ? b.category.trim().slice(0, 40) : null
    const channel = ['line', 'email', 'both'].includes(b.channel) ? b.channel : null
    const attachments = Array.isArray(b.attachments) ? b.attachments.filter((a: { type?: string; path?: string }) => a?.type === 'image' && a?.path).slice(0, 5) : null
    const buttons = parseButtons(b.buttons)
    const blocks = parseTplBlocks(b.blocks)
    const sort_order = Number.isFinite(b.sort_order) ? Math.trunc(b.sort_order) : 0
    const admin = await createServiceRoleClient()
    const { data, error } = await admin.from('message_templates')
      .insert({ title, body, subject, category, channel, attachments: attachments?.length ? attachments : null, buttons: buttons.length ? buttons : null, blocks: blocks.length ? blocks : null, sort_order, created_by: g.user!.id })
      .select('id, created_at, updated_at, title, body, subject, category, channel, attachments, buttons, blocks, sort_order, is_active').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ template: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
