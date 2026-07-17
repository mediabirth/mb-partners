/**
 * 案件のヒアリング回答（メニュー別・owner/manager）— vendor-redesign後続①。
 * GET — 案件のメニューに定義された項目＋回答（メニュー解決＝reward_snapshot.menu_id ?? deals.menu_id(service_menus)→menus）
 * PUT { answers: [{ item_id, value }] } — upsert（空文字は削除）
 * ★報酬計算・money系に一切非接続（記録専用・deal_events/金額に触れない）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { resolveMenuIdForDeal } from '@/lib/hearing'

export const runtime = 'nodejs'

async function requireOps(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager', 'admin'].includes(profile.role)) return null
  return user
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await requireOps(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const menuId = await resolveMenuIdForDeal(admin, id)
  if (!menuId) return NextResponse.json({ items: [], answers: {} })
  const [{ data: items }, { data: ans }] = await Promise.all([
    admin.from('menu_hearing_items').select('id, label, input_type, options, required, sort').eq('menu_id', menuId).eq('active', true).order('sort'),
    admin.from('deal_hearing_answers').select('item_id, value').eq('deal_id', id),
  ])
  return NextResponse.json({ items: items ?? [], answers: Object.fromEntries(((ans ?? []) as { item_id: string; value: string | null }[]).map(a => [a.item_id, a.value ?? ''])) })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const user = await requireOps(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { data: deal } = await admin.from('deals').select('id').eq('id', id).maybeSingle()
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
  const b = await req.json().catch(() => ({}))
  const answers = Array.isArray(b.answers) ? b.answers as { item_id?: string; value?: unknown }[] : null
  if (!answers) return NextResponse.json({ error: 'answers は必須です' }, { status: 400 })
  for (const a of answers) {
    if (!a.item_id) continue
    const value = String(a.value ?? '').trim().slice(0, 1000)
    if (!value) {
      await admin.from('deal_hearing_answers').delete().eq('deal_id', id).eq('item_id', a.item_id)
    } else {
      await admin.from('deal_hearing_answers').upsert({ deal_id: id, item_id: a.item_id, value, updated_at: new Date().toISOString(), updated_by: user.id }, { onConflict: 'deal_id,item_id' })
    }
  }
  return NextResponse.json({ ok: true })
}
